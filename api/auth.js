// Sign up, sign in, sign out, and "who am I" for Illume Studio.
//   GET  /api/auth              → { user:{name,role}|null, signupCode:bool, ready:bool }
//   POST /api/auth {action:"signup", username, password, code?}
//   POST /api/auth {action:"login",  username, password}
//   POST /api/auth {action:"logout"}
//   POST /api/auth {action:"forgot", username}            → emails a reset link (when email is set up)
//   POST /api/auth {action:"resetlink", username}         → (owner) a one-time reset link to send yourself
//   POST /api/auth {action:"reset", token, password}      → sets a new password from a link
//   POST /api/auth {action:"delete", password}            → deletes your account and everything in it
// Reset links are signed, last 1 hour, and stop working once the password changes.
// Email: set RESEND_API_KEY and RESET_FROM (e.g. "Illume <studio@illumeandco.online>").
// Anyone may sign up. Set SIGNUP_CODE in Vercel to require a code on sign-up
// (existing accounts keep working) — worth doing, since every account's
// generations are paid for by the one studio Atlas key.
const { randomBytes, createHmac, createHash, timingSafeEqual } = require("crypto");
const db = require("./_db");
const C = require("./_credits");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}
const KEY = () => createHash("sha256").update("illume-reset:" + (process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "")).digest();
const resetToken = (user, ms = 3600e3) => {
  const b = Buffer.from(JSON.stringify({ u: user.name, e: Date.now() + ms, h: String(user.hash).slice(0, 16) })).toString("base64url");
  return b + "." + createHmac("sha256", KEY()).update(b).digest("base64url");
};
function readToken(t) {
  const [b, sig] = String(t || "").split("."); if (!b || !sig) return null;
  const good = Buffer.from(createHmac("sha256", KEY()).update(b).digest("base64url")), given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try { const o = JSON.parse(Buffer.from(b, "base64url").toString()); return o.e > Date.now() ? o : null; } catch { return null; }
}
const site = req => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
const resetUrl = (req, user, ms) => `${site(req)}/generation?reset=${resetToken(user, ms)}`;
async function sendResetEmail(to, link) {
  const key = String(process.env.RESEND_API_KEY || "").trim(), from = String(process.env.RESET_FROM || "").trim();
  if (!key || !from) return false;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({
    from, to: [to], subject: "Reset your Illume password",
    html: `<div style="font-family:Georgia,serif;background:#0C0B09;color:#F3EDE2;padding:32px;border-radius:16px"><h1 style="font-weight:300;margin:0 0 12px">Illume Studio</h1><p style="font-family:system-ui;color:#B4AA9A">Tap the button to choose a new password. The link works for one hour.</p><p><a href="${link}" style="display:inline-block;background:#E8B54B;color:#1A1408;font-family:system-ui;font-weight:700;padding:12px 20px;border-radius:12px;text-decoration:none">Choose a new password</a></p><p style="font-family:system-ui;color:#7C7366;font-size:13px">Didn't ask for this? You can ignore this email.</p></div>`,
  }) });
  if (!r.ok) throw new Error("email service: " + r.status);
  return true;
}
async function removeAll(prefix) { // every blob under a prefix
  if (!blob) return;
  let cursor;
  do { const r = await blob.list({ prefix, cursor, limit: 1000 }); if (r.blobs.length) await blob.del(r.blobs.map(b => b.url || b.pathname)).catch(() => Promise.all(r.blobs.map(b => blob.del(b.pathname).catch(() => {})))); cursor = r.hasMore ? r.cursor : null; } while (cursor);
}
const clientIp = req => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const signupCode = String(process.env.SIGNUP_CODE || "").trim();

  if (req.method === "GET") {
    return res.status(200).json({ user: db.currentUser(req), signupCode: !!signupCode, ready: db.ready() });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

  const { action, username, password, code, ref } = req.body || {};
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
      await C.onSignup(name, ref).catch(e => console.log("signup credits failed:", e.message));
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

    if (action === "forgot") {
      const emailOk = !!(process.env.RESEND_API_KEY && process.env.RESET_FROM);
      if (!db.underLimit("forgot:" + clientIp(req), 5, 3600)) return res.status(429).json({ error: "Too many requests — try again in an hour." });
      const user = name ? await db.getUser(name) : null;
      // Same answer whether or not the account exists, so this can't be used to find accounts.
      if (user && emailOk && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(name)) await sendResetEmail(name, resetUrl(req, user));
      return res.status(200).json({ ok: true, email: emailOk });
    }
    if (action === "resetlink") {
      const me = db.currentUser(req);
      if (!me || me.role !== "owner") return res.status(403).json({ error: "Only the studio owner can make reset links." });
      const user = await db.getUser(name); if (!user) return res.status(404).json({ error: "No account with that name." });
      return res.status(200).json({ link: resetUrl(req, user, 24 * 3600e3) });
    }
    if (action === "reset") {
      const t = readToken(req.body && req.body.token);
      if (!t) return res.status(400).json({ error: "This reset link has expired or was already used — ask for a new one." });
      const user = await db.getUser(t.u);
      if (!user || String(user.hash).slice(0, 16) !== t.h) return res.status(400).json({ error: "This reset link has expired or was already used — ask for a new one." });
      if (pw.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
      const salt = randomBytes(16).toString("hex"), hash = await db.hashPassword(pw, salt);
      const r = await db.readJson(`users/${db.fileKey(user.name)}.json`);
      await db.writeJson(`users/${db.fileKey(user.name)}.json`, { ...(r && r.value), hash, salt, passwordChanged: Date.now() });
      db.startSession(res, { name: user.name, role: user.role || "member" });
      return res.status(200).json({ user: { name: user.name, role: user.role || "member" } });
    }
    if (action === "delete") {
      const me = db.currentUser(req); if (!me) return res.status(401).json({ error: "Please sign in." });
      if (me.role === "owner") return res.status(400).json({ error: "The studio owner's account can't be deleted from here — it runs the studio for everyone." });
      const user = await db.getUser(me.name);
      if (!user || !(await db.passwordMatches(pw, user))) return res.status(403).json({ error: "That password isn't right." });
      const k = db.fileKey(me.name);
      // reviews you shared
      if (blob) { let cursor; do { const r = await blob.list({ prefix: "review/", cursor, limit: 1000 }); for (const b of r.blobs) { const x = await db.readJson(b.pathname).catch(() => null); if (x && x.value && x.value.owner === me.name) await blob.del(b.pathname).catch(() => {}); } cursor = r.hasMore ? r.cursor : null; } while (cursor); }
      await removeAll(`media/${k}/`);
      for (const f of [`data/${k}.json`, `mcpdata/${k}.json`, `mcp/${k}.json`, `drive/${k}.json`, `wallet/${k}.json`, `locks/${k}`, `refs/${C.refCode(me.name)}.json`, `users/${k}.json`]) await blob.del(f).catch(() => {});
      db.endSession(req, res);
      console.log("account deleted:", me.name);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.log("auth failed:", e.message);
    res.status(503).json({ error: "Couldn't reach the accounts store: " + e.message });
  }
};
