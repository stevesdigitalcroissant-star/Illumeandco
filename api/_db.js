// Accounts and each person's saved work, in a PRIVATE Vercel Blob store.
//
// Connecting the Blob store to the Vercel project adds BLOB_READ_WRITE_TOKEN,
// which @vercel/blob reads on its own. The store must be private: nothing in it
// is reachable without that token.
//
// Files in the store:
//   users/<name>.json  (name as fileKey(): @ → ~40, + → ~2b)
//   → { hash, salt, created, role }   (role "owner" = first account)
//   owner.json        → { name }  written once, by the first sign-up
//   data/<name>.json  → { key: value, … } that person's studio work
//
// Blob has no counters or expiring keys, so sessions are a signed cookie
// (HMAC — nothing stored, no Blob call per request) instead of a lookup table.
// Blob write operations are metered, so data is saved as ONE file per person,
// and the page batches its saves.
const { randomBytes, scrypt, timingSafeEqual, createHmac, createHash } = require("crypto");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

const SESSION_DAYS = 30;
const COOKIE = "il_sess";
const ready = () => !!(blob && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID));

function dbReady(res) {
  if (ready()) return true;
  res.status(503).json({ error: "Accounts aren't set up yet: connect a private Blob store to this project in Vercel (Storage → Blob), then redeploy." });
  return false;
}

// ---- JSON files in Blob
async function readJson(pathname) {
  const r = await blob.get(pathname, { access: "private", useCache: false }); // never a stale cached copy
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const text = await new Response(r.stream).text();
  try { return { value: JSON.parse(text), etag: r.blob && r.blob.etag }; } catch { return null; }
}
// overwrite:false → fails if the file already exists (used to claim a username atomically).
// ifMatch → only writes if nobody changed the file since it was read.
async function writeJson(pathname, value, { overwrite = true, ifMatch } = {}) {
  const opts = { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: overwrite, cacheControlMaxAge: 60 };
  if (ifMatch) opts.ifMatch = ifMatch;
  return blob.put(pathname, JSON.stringify(value), opts);
}
// "This blob already exists…" (a write with allowOverwrite:false) or an ETag
// mismatch (ifMatch). Careful not to match "does not exist" (missing store/file).
const alreadyExists = e => (e && e.name === "BlobPreconditionFailedError")
  || /already exists|precondition failed|etag mismatch/i.test(String((e && e.message) || ""));

// ---- passwords
const hashPassword = (password, salt) => new Promise((ok, fail) =>
  scrypt(password, salt, 64, (err, key) => (err ? fail(err) : ok(key.toString("hex")))));
async function passwordMatches(password, user) {
  const a = Buffer.from(await hashPassword(password, user.salt), "hex"), b = Buffer.from(user.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Usernames are case-insensitive: "Ann" and "ann" are the same account.
const cleanName = n => String(n || "").trim().toLowerCase();
// An email address works as a username (steve@example.com), so @ and + are allowed.
const validName = n => /^[a-z0-9._@+-]{3,64}$/.test(n) && !n.includes("..");
// Blob file name for a username: @ and + spelled out (~40, ~2b) so paths stay plain.
// "~" itself can't appear in a username, so two names can never share a file.
const fileKey = name => name.replace(/[^a-z0-9._-]/g, c => "~" + c.charCodeAt(0).toString(16).padStart(2, "0"));

async function getUser(name) {
  const r = await readJson(`users/${fileKey(name)}.json`);
  return r && r.value && r.value.hash ? { name, ...r.value } : null;
}

// Best-effort brake on password guessing, per server instance (Blob has no
// atomic counters). Scrypt already makes each guess slow.
const attempts = new Map();
function underLimit(key, max, windowSec) {
  const now = Date.now(), a = attempts.get(key);
  if (!a || a.until < now) { attempts.set(key, { n: 1, until: now + windowSec * 1000 }); return true; }
  return ++a.n <= max;
}
const clearLimit = key => attempts.delete(key);

// ---- sessions: "<name>.<role>.<expires>.<signature>"
function secret() {
  const s = process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "";
  return createHash("sha256").update("illume-session:" + s).digest();
}
const sign = payload => createHmac("sha256", secret()).update(payload).digest("hex");
function startSession(res, user) {
  const expires = Date.now() + SESSION_DAYS * 86400e3;
  const payload = `${user.name}.${user.role || "member"}.${expires}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
function endSession(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function sessionCookie(req) {
  return (req.cookies && req.cookies[COOKIE]) || (String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)) || [])[1] || "";
}

// The signed-in person, or null.
function currentUser(req) {
  if (!ready()) return null;
  const m = sessionCookie(req).match(/^([a-z0-9._@+-]{3,64})\.(owner|member)\.(\d{10,})\.([a-f0-9]{64})$/);
  if (!m) return null;
  const [, name, role, expires, sig] = m;
  const good = Buffer.from(sign(`${name}.${role}.${expires}`), "hex"), given = Buffer.from(sig, "hex");
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  if (Number(expires) < Date.now()) return null;
  return { name, role };
}

// Gate for every studio endpoint: responds 401 and returns null when signed out.
async function requireUser(req, res) {
  if (!dbReady(res)) return null;
  const user = currentUser(req);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return null; }
  return user;
}

module.exports = {
  ready, dbReady, readJson, writeJson, alreadyExists, hashPassword, passwordMatches, cleanName, validName, fileKey,
  getUser, underLimit, clearLimit, startSession, endSession, currentUser, requireUser,
};
