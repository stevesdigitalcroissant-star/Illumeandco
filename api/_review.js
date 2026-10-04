// Client review links: a private link to one project's storyboard that a client
// can open without an account, watch the shots, approve them or ask for changes.
//
//   POST /api/studio?fn=review { action:"publish", proj, title, client, shots:[{id,path,mode,dur}], token? }
//        (signed in) create the link, or refresh its shots → { token }
//   POST /api/studio?fn=review { action:"revoke", token }       (signed in) stop sharing
//   GET  /api/studio?fn=review&t=TOKEN                         (anyone with the link) the shots + feedback
//   GET  /api/studio?fn=review&t=TOKEN&f=SHOT_ID               (anyone with the link) stream that shot's file
//   POST /api/studio?fn=review { action:"feedback", t, take, status?, comment?, name }  (anyone with the link)
//
// Stored at review/<token>.json. The token is 128 random bits; only files listed
// in that review can be read through it, and only the owner can change its shots.
const { randomBytes } = require("crypto");
const { Readable } = require("stream");
const db = require("./_db");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

const okToken = t => /^[A-Za-z0-9_-]{20,40}$/.test(String(t || ""));
const path = t => `review/${t}.json`;
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const read = async t => { if (!okToken(t)) return null; const r = await db.readJson(path(t)).catch(() => null); return r && r.value; };

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      const r = await read(q.t);
      if (!r) return res.status(404).json({ error: "This review link isn't active any more." });
      if (q.f) { // one shot's file
        const s = r.shots.find(x => x.id === q.f); if (!s) return res.status(404).end();
        const range = req.headers.range;
        const b = await blob.get(s.path, { access: "private", headers: range ? { Range: range } : {} });
        if (!b || !b.stream) return res.status(404).end();
        res.setHeader("Content-Type", (b.blob && b.blob.contentType) || "application/octet-stream");
        res.setHeader("Accept-Ranges", "bytes");
        const len = b.headers.get("content-length"); if (len) res.setHeader("Content-Length", len);
        const cr = b.headers.get("content-range"); if (cr) res.setHeader("Content-Range", cr);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.status(cr ? 206 : 200);
        if (req.method === "HEAD") return res.end();
        return Readable.fromWeb(b.stream).on("error", () => res.end()).pipe(res);
      }
      return res.status(200).json({
        title: r.title, client: r.client, updated: r.updated,
        shots: r.shots.map(s => ({ id: s.id, mode: s.mode, dur: s.dur || null, note: s.note || "", src: `/api/studio?fn=review&t=${q.t}&f=${encodeURIComponent(s.id)}` })),
        feedback: r.feedback || {},
      });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Not allowed." });
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};

    if (b.action === "feedback") { // the client, no account
      const r = await read(b.t); if (!r) return res.status(404).json({ error: "This review link isn't active any more." });
      const takes = b.take === "*" ? r.shots.map(s => s.id) : [b.take];
      if (!takes.length || takes.some(id => !r.shots.some(s => s.id === id))) return res.status(400).json({ error: "Unknown shot." });
      const name = clean(b.name, 60) || "Client", text = clean(b.comment, 1000);
      r.feedback = r.feedback || {};
      for (const id of takes) {
        const f = r.feedback[id] || (r.feedback[id] = { status: null, comments: [] });
        if (b.status === "approved" || b.status === "changes") { f.status = b.status; f.by = name; f.at = Date.now(); }
        if (b.status === "clear") { f.status = null; f.by = name; f.at = Date.now(); }
        if (text) { f.comments.push({ name, text, t: Date.now() }); f.comments = f.comments.slice(-100); }
      }
      r.updated = Date.now();
      await db.writeJson(path(b.t), r);
      return res.status(200).json({ ok: true, feedback: r.feedback });
    }

    const user = await db.requireUser(req, res); if (!user) return;
    if (b.action === "revoke") {
      const r = await read(b.token);
      if (r && r.owner === user.name) await blob.del(path(b.token));
      return res.status(200).json({ ok: true });
    }
    if (b.action === "publish") {
      const mine = `media/${db.fileKey(user.name)}/`;
      const shots = (Array.isArray(b.shots) ? b.shots : []).slice(0, 200)
        .filter(s => s && typeof s.path === "string" && s.path.startsWith(mine) && !s.path.includes(".."))
        .map(s => ({ id: clean(s.id, 80), path: s.path, mode: ["image", "video", "audio"].includes(s.mode) ? s.mode : "image", dur: Number(s.dur) || null, note: clean(s.note, 500) }));
      if (!shots.length) return res.status(400).json({ error: "No saved shots to share yet — shots appear here once they're saved." });
      let token = okToken(b.token) ? b.token : null, prev = token ? await read(token) : null;
      if (prev && prev.owner !== user.name) { token = null; prev = null; }
      if (!token) token = randomBytes(16).toString("base64url");
      const r = { owner: user.name, proj: clean(b.proj, 80), title: clean(b.title, 120) || "Storyboard", client: clean(b.client, 120), shots, feedback: (prev && prev.feedback) || {}, created: (prev && prev.created) || Date.now(), updated: Date.now() };
      await db.writeJson(path(token), r);
      return res.status(200).json({ token });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.log("review failed:", e.message);
    res.status(502).json({ error: e.message });
  }
};
