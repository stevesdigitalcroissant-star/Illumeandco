// Accounts, sessions and each person's saved work, in Upstash Redis.
//
// Talks to Upstash's REST API with plain fetch, so the site still needs no
// package.json or build step. Connecting Upstash to the Vercel project (Storage
// → Upstash Redis → Connect) adds KV_REST_API_URL / KV_REST_API_TOKEN; the
// UPSTASH_REDIS_REST_* names Upstash uses directly work too.
//
// Keys:
//   user:<name>   → hash { hash, salt, created, role }   (role "owner" = first account)
//   sess:<token>  → username, expires after SESSION_DAYS
//   data:<name>   → hash, one field per saved studio key (projects, hist, drafts…)
//   rl:<what>     → counters for rate limiting
const { randomBytes, scrypt, timingSafeEqual } = require("crypto");

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SESSION_DAYS = 30;
const COOKIE = "il_sess";

function dbReady(res) {
  if (DB_URL && DB_TOKEN) return true;
  res.status(503).json({ error: "Accounts aren't set up yet: connect Upstash Redis to this project in Vercel (Storage → Upstash Redis), then redeploy." });
  return false;
}

// One Redis command, e.g. cmd("GET", "user:ann").
async function cmd(...args) {
  const r = await fetch(DB_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${DB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("Database error: " + (j.error || r.status));
  return j.result;
}

// Hashes come back from Upstash as a flat [field, value, field, value…] list.
const pairs = list => { const o = {}; for (let i = 0; i + 1 < (list || []).length; i += 2) o[list[i]] = list[i + 1]; return o; };

const hashPassword = (password, salt) => new Promise((ok, fail) =>
  scrypt(password, salt, 64, (err, key) => (err ? fail(err) : ok(key.toString("hex")))));
async function passwordMatches(password, user) {
  const a = Buffer.from(await hashPassword(password, user.salt), "hex"), b = Buffer.from(user.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Usernames are case-insensitive: "Ann" and "ann" are the same account.
const cleanName = n => String(n || "").trim().toLowerCase();
const validName = n => /^[a-z0-9._-]{3,32}$/.test(n);

async function getUser(name) {
  const u = pairs(await cmd("HGETALL", "user:" + name));
  return u.hash ? { name, ...u } : null;
}

// Counts attempts in a window; true while under the limit.
async function underLimit(key, max, windowSec) {
  const n = await cmd("INCR", "rl:" + key);
  if (n === 1) await cmd("EXPIRE", "rl:" + key, windowSec);
  return n <= max;
}

async function startSession(res, name) {
  const token = randomBytes(32).toString("hex");
  await cmd("SET", "sess:" + token, name, "EX", SESSION_DAYS * 86400);
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
async function endSession(req, res) {
  const token = sessionToken(req);
  if (token) await cmd("DEL", "sess:" + token).catch(() => {});
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function sessionToken(req) {
  const c = (req.cookies && req.cookies[COOKIE]) || (String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`)) || [])[1];
  return /^[a-f0-9]{64}$/.test(c || "") ? c : null;
}

// The signed-in person, or null. Never throws for a missing/expired session.
async function currentUser(req) {
  if (!DB_URL || !DB_TOKEN) return null;
  const token = sessionToken(req); if (!token) return null;
  const name = await cmd("GET", "sess:" + token);
  if (!name) return null;
  const role = await cmd("HGET", "user:" + name, "role");
  return { name, role: role || "member" };
}

// Gate for every studio endpoint: responds 401 and returns null when signed out.
async function requireUser(req, res) {
  if (!dbReady(res)) return null;
  let user = null;
  try { user = await currentUser(req); } catch (e) { res.status(503).json({ error: e.message }); return null; }
  if (!user) { res.status(401).json({ error: "Please sign in." }); return null; }
  return user;
}

module.exports = {
  cmd, pairs, dbReady, hashPassword, passwordMatches, cleanName, validName,
  getUser, underLimit, startSession, endSession, currentUser, requireUser,
};
