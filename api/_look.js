// Picture tiles for the Look picker (camera, lens, focus, framing, grade).
// The owner makes them once with Seedream from the Studio; the page shrinks each
// result to a small tile and saves it here, so every account sees the same set.
//   GET  /api/studio?fn=look                 → { have: { key: version } }   (anyone signed in)
//   GET  /api/studio?fn=look&k=KEY&v=VER      → the tile image (cached for a long time)
//   POST /api/studio?fn=look { action:"save", key, data }   (owner) data = base64 webp/jpeg
// Stored in the Blob store as look/<key>.<ext> plus look/index.json.
const { Readable } = require("stream");
const db = require("./_db");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

const okKey = k => /^[a-z0-9-]{3,60}$/.test(String(k || ""));
const INDEX = "look/index.json";
const MAX = 400 * 1024; // a tile is ~30–80KB; anything bigger wasn't shrunk

module.exports = async (req, res) => {
  const user = await db.requireUser(req, res); if (!user) return;
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      const idx = ((await db.readJson(INDEX).catch(() => null)) || {}).value || {};
      if (!req.query.k) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ have: Object.fromEntries(Object.entries(idx).map(([k, v]) => [k, v.v])), src: Object.fromEntries(Object.entries(idx).map(([k, v]) => [k, v.src || "ai"])) }); }
      const e = idx[req.query.k]; if (!okKey(req.query.k) || !e) return res.status(404).end();
      const b = await blob.get(e.path, { access: "private" });
      if (!b || !b.stream) return res.status(404).end();
      res.setHeader("Content-Type", e.type || "image/webp");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable"); // the URL carries the version
      res.status(200);
      if (req.method === "HEAD") return res.end();
      return Readable.fromWeb(b.stream).on("error", () => res.end()).pipe(res);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Not allowed." });
    if (user.role !== "owner") return res.status(403).json({ error: "Only the studio owner can change the Look pictures." });
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
    if (b.action !== "save") return res.status(400).json({ error: "Unknown action." });
    if (!okKey(b.key)) return res.status(400).json({ error: "Bad key." });
    const buf = Buffer.from(String(b.data || ""), "base64");
    if (!buf.length || buf.length > MAX) return res.status(413).json({ error: "That picture is too big." });
    const type = buf.slice(0, 4).toString("hex") === "52494646" ? "image/webp" : buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : null;
    if (!type) return res.status(400).json({ error: "Not a webp or jpeg." });
    const path = `look/${b.key}.${type === "image/webp" ? "webp" : "jpg"}`;
    await blob.put(path, buf, { access: "private", contentType: type, addRandomSuffix: false, allowOverwrite: true });
    const idx = ((await db.readJson(INDEX).catch(() => null)) || {}).value || {};
    idx[b.key] = { path, type, v: Date.now().toString(36), src: b.src === "photo" ? "photo" : "ai" }; // "photo" = a real licensed photo, "ai" = made with Seedream
    await db.writeJson(INDEX, idx);
    res.status(200).json({ ok: true, v: idx[b.key].v });
  } catch (e) {
    console.log("look failed:", e.message);
    res.status(502).json({ error: e.message });
  }
};
