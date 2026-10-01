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
const { keepUrl } = require("./_keep");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}


module.exports = async (req, res) => {
  const user = await db.requireUser(req, res);
  if (!user) return;
  const mine = `media/${db.fileKey(user.name)}/`;

  if (req.method === "POST") {
    const { url, id } = req.body || {};
    try { return res.status(200).json(await keepUrl(user, url, id)); }
    catch (e) { console.log("keep failed:", e.message); return res.status(e.status || 502).json({ error: e.message }); }
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
