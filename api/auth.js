// Sign up, sign in, sign out, and "who am I" for Illume Studio.
//   GET  /api/auth              → { user:{name,role}|null, signupCode:bool, ready:bool }
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
    return res.status(200).json({ user: db.currentUser(req), signupCode: !!signupCode, ready: db.ready() });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

  const { action, username, password, code } = req.body || {};
  if (action === "logout") { db.endSession(req, res); return res.status(200).json({ ok: true }); }
  if (!db.dbReady(res)) return;

  const name = db.cleanName(username);
  const pw = String(password || "");
  try {
    if (action === "signup") {
      if (signupCode && String(code || "").trim() !== signupCode) return res.status(403).json({ error: "That sign-up code isn't right." });
      if (!db.validName(name)) return res.status(400).json({ error: "Use your email, or a username of 3–64 letters, numbers, dots, dashes or underscores (no spaces)." });
      if (pw.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
      if (!db.underLimit("signup:" + clientIp(req), 5, 3600)) return res.status(429).json({ error: "Too many new accounts from here — try again in an hour." });
      const salt = randomBytes(16).toString("hex");
      const hash = await db.hashPassword(pw, salt);
      // The very first account is the studio owner (sees the Atlas balance).
      // Written without overwrite, so only one sign-up can ever claim it.
      let role = "member";
      if (!(await db.readJson("owner.json"))) {
        try { await db.writeJson("owner.json", { name }, { overwrite: false }); role = "owner"; }
        catch (e) { if (!db.alreadyExists(e)) throw e; }
      }
      // Creating the user file without overwrite claims the name atomically.
      try { await db.writeJson(`users/${db.fileKey(name)}.json`, { hash, salt, created: Date.now(), role }, { overwrite: false }); }
      catch (e) { if (db.alreadyExists(e)) return res.status(409).json({ error: "That username is taken." }); throw e; }
      db.startSession(res, { name, role });
      return res.status(200).json({ user: { name, role }, created: true });
    }

    if (action === "login") {
      if (!name || !pw) return res.status(400).json({ error: "Enter your username and password." });
      if (!db.underLimit("login:" + name, 10, 900)) return res.status(429).json({ error: "Too many attempts — wait 15 minutes and try again." });
      const user = await db.getUser(name);
      if (!user || !(await db.passwordMatches(pw, user))) return res.status(401).json({ error: "Wrong username or password." });
      db.clearLimit("login:" + name);
      db.startSession(res, user);
      return res.status(200).json({ user: { name, role: user.role || "member" } });
    }

    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.log("auth failed:", e.message);
    res.status(503).json({ error: "Couldn't reach the accounts store: " + e.message });
  }
};
