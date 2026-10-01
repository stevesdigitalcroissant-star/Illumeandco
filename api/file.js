// Permanent copies of everything the studio makes, in the private Blob store.
//
// Atlas Cloud only keeps results for a limited time, so the moment a generation
// finishes the page asks this endpoint to copy it into our own storage:
//   POST /api/file { url, id }  → { path, size, type }   (copy, then serve from us forever)
//   GET  /api/file?p=<path>[&download=1&name=x.jpg]       (stream it back; Range for video)
//   DELETE /api/file?p=<path>                              (delete it)
// Files live under media/<user>/…, and only that signed-in user can read them.
const { Readable } = require("stream");
const db = require("./_db");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

// Same hosts /api/media accepts: where Atlas Cloud's models deliver results.
const ALLOWED_HOST = /(^|\.)(aliyuncs\.com|volces\.com|byteimg\.com|atlascloud\.ai|amazonaws\.com|googleapis\.com|cloudfront\.net|r2\.dev|replicate\.delivery|fal\.media)$/i;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg" };

module.exports = async (req, res) => {
  const user = await db.requireUser(req, res);
  if (!user) return;
  const mine = `media/${db.fileKey(user.name)}/`;

  if (req.method === "POST") {
    const { url, id } = req.body || {};
    let target;
    try { target = new URL(String(url || "")); } catch { return res.status(400).json({ error: "Bad url." }); }
    if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) return res.status(400).json({ error: "This host isn't allowed: " + target.hostname });
    const safeId = String(id || Date.now()).replace(/[^\w-]/g, "").slice(0, 80) || String(Date.now());
    try {
      const up = await fetch(target);
      if (!up.ok || !up.body) return res.status(502).json({ error: `Atlas storage returned ${up.status} — the file may have expired.` });
      const type = (up.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const ext = EXT[type] || (target.pathname.match(/\.(\w{2,5})$/) || [, "bin"])[1].toLowerCase();
      const size = Number(up.headers.get("content-length")) || 0;
      const path = `${mine}${safeId}.${ext}`;
      await blob.put(path, up.body, {
        access: "private", contentType: type || "application/octet-stream", addRandomSuffix: false, allowOverwrite: true,
        multipart: size > 8 * 1024 * 1024 || /^video\//.test(type), // big files go up in parts
      });
      return res.status(200).json({ path, size, type });
    } catch (e) {
      console.log("keep failed:", e.message);
      return res.status(502).json({ error: "Couldn't save a permanent copy: " + e.message });
    }
  }

  const p = String(req.query.p || "");
  if (req.method === "DELETE") {   // delete a take's permanent copy (only your own)
    if (!p.startsWith(mine) || p.includes("..")) return res.status(404).json({ error: "Not found." });
    try { await blob.del(p); return res.status(200).json({ ok: true }); }
    catch (e) { console.log("file delete failed:", e.message); return res.status(502).json({ error: e.message }); }
  }
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();
  if (!p.startsWith(mine) || p.includes("..")) return res.status(404).end(); // only your own files
  try {
    const range = req.headers.range;
    const r = await blob.get(p, { access: "private", headers: range ? { Range: range } : {} });
    if (!r || !r.stream) return res.status(404).end();
    const h = r.headers;
    res.setHeader("Content-Type", r.blob.contentType || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    const len = h.get("content-length"); if (len) res.setHeader("Content-Length", len);
    const cr = h.get("content-range"); if (cr) res.setHeader("Content-Range", cr);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable"); // the path never changes content
    if (req.query.download) {
      const name = String(req.query.name || p.split("/").pop()).replace(/[^\w.\- ]+/g, "_");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    }
    res.status(cr ? 206 : 200);
    if (req.method === "HEAD") return res.end();
    Readable.fromWeb(r.stream).on("error", () => res.end()).pipe(res);
  } catch (e) {
    console.log("file read failed:", e.message);
    res.status(502).json({ error: e.message });
  }
};
