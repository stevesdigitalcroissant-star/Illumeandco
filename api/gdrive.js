// Google Drive: each person can connect their own Drive, and every take is
// saved into  Illume Studio / <Client> / <Project>  there — a permanent, synced
// copy they can browse, open on any device and share with a client.
//
//   GET  /api/gdrive?status=1            → { configured, connected, email }
//   GET  /api/gdrive?connect=1           → redirect to Google's consent screen
//   GET  /api/gdrive?code=…&state=…      → Google sends you back here (the redirect URI)
//   POST /api/gdrive { action:"save", path, client, project, name } → { id, link }
//   POST /api/gdrive { action:"disconnect" }
//
// Setup (once, in Vercel): GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a Google
// Cloud OAuth client whose redirect URI is  https://<your domain>/api/gdrive
// Scope is drive.file: the studio can only see files it created itself.
// The refresh token is stored encrypted (AES-256-GCM) in the private Blob store.
const { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } = require("crypto");
const db = require("./_db");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

const CID = () => String(process.env.GOOGLE_CLIENT_ID || "").trim();
const SECRET = () => String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
const configured = () => !!(CID() && SECRET());
const SCOPE = "https://www.googleapis.com/auth/drive.file openid email";
const ROOT_FOLDER = "Illume Studio";

const keyMaterial = () => createHash("sha256").update("illume-drive:" + (process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "")).digest();
function seal(text) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString("base64")).join(".");
}
function unseal(s) {
  const [iv, tag, enc] = String(s).split(".").map(x => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", keyMaterial(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
const sign = v => createHmac("sha256", keyMaterial()).update(v).digest("base64url");
const recordPath = user => `drive/${db.fileKey(user.name)}.json`;
const redirectUri = req => `https://${req.headers["x-forwarded-host"] || req.headers.host}/api/gdrive`;

async function token(form) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google sign-in failed: " + (j.error_description || j.error || r.status));
  return j;
}
async function accessToken(rec) {
  const j = await token({ client_id: CID(), client_secret: SECRET(), refresh_token: unseal(rec.rt), grant_type: "refresh_token" });
  return j.access_token;
}
async function g(path, at, init = {}) {
  const r = await fetch("https://www.googleapis.com" + path, { ...init, headers: { Authorization: "Bearer " + at, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error("Google Drive: " + ((j.error && j.error.message) || r.status)); e.status = r.status; throw e; }
  return j;
}
const q = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function folder(at, name, parent) {
  const query = `name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parent ? ` and '${parent}' in parents` : " and 'root' in parents");
  const found = await g(`/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`, at);
  if (found.files && found.files.length) return found.files[0].id;
  const made = await g("/drive/v3/files?fields=id", at, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parent ? [parent] : undefined }) });
  return made.id;
}
async function folderChain(rec, at, client, project) {
  const key = `${client}/${project}`;
  rec.folders = rec.folders || {};
  if (rec.folders[key]) return rec.folders[key];
  const root = rec.folders[""] || (rec.folders[""] = await folder(at, ROOT_FOLDER, null));
  const c = await folder(at, client, root);
  const p = await folder(at, project, c);
  rec.folders[key] = p;
  return p;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const user = await db.requireUser(req, res);
  if (!user) return;

  if (req.method === "GET" && req.query.status) {
    const r = configured() ? await db.readJson(recordPath(user)).catch(() => null) : null;
    return res.status(200).json({ configured: configured(), connected: !!(r && r.value && r.value.rt), email: (r && r.value && r.value.email) || null });
  }
  if (!configured()) return res.status(503).json({ error: "Google Drive isn't set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel." });

  if (req.method === "GET" && req.query.connect) {
    const payload = `${user.name}|${Date.now() + 10 * 60e3}|${randomBytes(8).toString("hex")}`;
    const state = Buffer.from(payload).toString("base64url") + "." + sign(payload);
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({ client_id: CID(), redirect_uri: redirectUri(req), response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).forEach(([k, v]) => u.searchParams.set(k, v));
    res.statusCode = 302; res.setHeader("Location", u.toString()); return res.end();
  }

  if (req.method === "GET" && (req.query.code || req.query.error)) {
    const back = msg => { res.statusCode = 302; res.setHeader("Location", "/generation?drive=" + encodeURIComponent(msg)); res.end(); };
    if (req.query.error) return back("cancelled");
    const [b64, sig] = String(req.query.state || "").split(".");
    const payload = Buffer.from(b64 || "", "base64url").toString();
    const good = Buffer.from(sign(payload)), given = Buffer.from(sig || "");
    const [name, exp] = payload.split("|");
    if (good.length !== given.length || !timingSafeEqual(good, given) || name !== user.name || Number(exp) < Date.now()) return back("expired");
    try {
      const t = await token({ code: String(req.query.code), client_id: CID(), client_secret: SECRET(), redirect_uri: redirectUri(req), grant_type: "authorization_code" });
      if (!t.refresh_token) return back("norefresh");
      let email = null;
      try { email = JSON.parse(Buffer.from(String(t.id_token).split(".")[1], "base64url").toString()).email || null; } catch {}
      await db.writeJson(recordPath(user), { rt: seal(t.refresh_token), email, folders: {}, connected: Date.now() });
      return back("connected");
    } catch (e) { console.log("drive connect failed:", e.message); return back("failed"); }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Not allowed." });
  const { action } = req.body || {};
  const r = await db.readJson(recordPath(user)).catch(() => null);
  const rec = r && r.value;

  if (action === "disconnect") {
    if (rec && rec.rt) { try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(unseal(rec.rt)), { method: "POST" }); } catch {} }
    await db.writeJson(recordPath(user), { disconnected: Date.now() });
    return res.status(200).json({ ok: true });
  }

  if (action === "save") {
    if (!rec || !rec.rt) return res.status(409).json({ error: "Google Drive isn't connected." });
    const { path, client, project, name } = req.body || {};
    const mine = `media/${db.fileKey(user.name)}/`;
    if (!String(path || "").startsWith(mine)) return res.status(404).json({ error: "File not found." });
    try {
      const at = await accessToken(rec);
      let parent = await folderChain(rec, at, String(client || "Unsorted").slice(0, 100), String(project || "General").slice(0, 100));
      const upload = async () => {
        const file = await blob.get(path, { access: "private" });
        if (!file || !file.stream) throw new Error("The permanent copy wasn't found.");
        const type = file.blob.contentType || "application/octet-stream", size = file.headers.get("content-length");
        // Resumable upload: start a session, then stream the bytes (works for big videos).
        const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
          method: "POST",
          headers: { Authorization: "Bearer " + at, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": type, ...(size ? { "X-Upload-Content-Length": size } : {}) },
          body: JSON.stringify({ name: String(name || path.split("/").pop()).slice(0, 200), parents: [parent] }),
        });
        if (!start.ok) { const e = new Error("Google Drive refused the upload (" + start.status + ")"); e.status = start.status; throw e; }
        const put = await fetch(start.headers.get("location"), { method: "PUT", headers: { "Content-Type": type, ...(size ? { "Content-Length": size } : {}) }, body: file.stream, duplex: "half" });
        const j = await put.json().catch(() => ({}));
        if (!put.ok) throw new Error("Google Drive upload failed (" + put.status + ")");
        return j;
      };
      let out;
      try { out = await upload(); }
      catch (e) { if (e.status !== 404) throw e; rec.folders = {}; parent = await folderChain(rec, at, client || "Unsorted", project || "General"); out = await upload(); } // a folder was deleted in Drive: rebuild
      await db.writeJson(recordPath(user), rec); // remember folder ids
      return res.status(200).json({ id: out.id, link: out.webViewLink || `https://drive.google.com/file/d/${out.id}/view` });
    } catch (e) {
      console.log("drive save failed:", e.message);
      return res.status(502).json({ error: e.message });
    }
  }
  res.status(400).json({ error: "Unknown action." });
};
