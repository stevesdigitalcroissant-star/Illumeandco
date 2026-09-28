// Sign up, sign in, sign out, and "who am I" for Illume Studio.
//   GET  /api/auth              → { user:{name,role}|null, signupCode:bool }
//   POST /api/auth {action:"signup", username, password, code?}
//   POST /api/auth {action:"login",  username, password}
//   POST /api/auth {action:"logout"}
// Anyone may sign up. Set SIGNUP_CODE in Vercel to require a code on sign-up
// (existing accounts keep working) — worth doing, since every account's
// generations are paid for by the one studio Atlas key.
const { randomBytes } = require("crypto");
const db = require("./_db");

const clientIp = req => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const signupCode = String(process.env.SIGNUP_CODE || "").trim();

  if (req.method === "GET") {
    let user = null;
    try { user = await db.currentUser(req); } catch {}
    return res.status(200).json({ user, signupCode: !!signupCode, ready: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });
  if (!db.dbReady(res)) return;

  const { action, username, password, code } = req.body || {};
  try {
    if (action === "logout") {
      await db.endSession(req, res);
      return res.status(200).json({ ok: true });
    }

    const name = db.cleanName(username);
    const pw = String(password || "");

    if (action === "signup") {
      if (signupCode && String(code || "").trim() !== signupCode) return res.status(403).json({ error: "That sign-up code isn't right." });
      if (!db.validName(name)) return res.status(400).json({ error: "Username: 3–32 characters — letters, numbers, dot, dash or underscore." });
      if (pw.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
      if (!(await db.underLimit("signup:" + clientIp(req), 5, 3600))) return res.status(429).json({ error: "Too many new accounts from here — try again in an hour." });
      // Claim the name atomically so two people can't register it at once.
      const claimed = await db.cmd("SET", "name:" + name, "1", "NX");
      if (claimed !== "OK") return res.status(409).json({ error: "That username is taken." });
      const salt = randomBytes(16).toString("hex");
      const hash = await db.hashPassword(pw, salt);
      // The very first account is the studio owner (sees the Atlas balance).
      const first = (await db.cmd("SET", "owner", name, "NX")) === "OK";
      await db.cmd("HSET", "user:" + name, "hash", hash, "salt", salt, "created", String(Date.now()), "role", first ? "owner" : "member");
      await db.startSession(res, name);
      return res.status(200).json({ user: { name, role: first ? "owner" : "member" }, created: true });
    }

    if (action === "login") {
      if (!name || !pw) return res.status(400).json({ error: "Enter your username and password." });
      if (!(await db.underLimit("login:" + name, 10, 900))) return res.status(429).json({ error: "Too many attempts — wait 15 minutes and try again." });
      const user = await db.getUser(name);
      if (!user || !(await db.passwordMatches(pw, user))) return res.status(401).json({ error: "Wrong username or password." });
      await db.cmd("DEL", "rl:login:" + name);
      await db.startSession(res, name);
      return res.status(200).json({ user: { name, role: user.role || "member" } });
    }

    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.log("auth failed:", e.message);
    res.status(503).json({ error: e.message });
  }
};
