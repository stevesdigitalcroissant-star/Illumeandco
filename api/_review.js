// Client review links: a private link to one project's storyboard that a client
// can open without an account, watch the shots, approve them or ask for changes.
//
//   POST /api/studio?fn=review { action:"publish", proj, title, client, shots:[{id,path,mode,dur}], token? }
//        (signed in) create the link, or refresh its shots → { token }
//   POST /api/studio?fn=review { action:"revoke", token }       (signed in) stop sharing
//   GET  /api/studio?fn=review&t=TOKEN                         (anyone with the link) the shots + feedback
//   GET  /api/studio?fn=review&t=TOKEN&f=SHOT_ID               (anyone with the link) stream that shot's file
//   POST /api/studio?fn=review { action:"feedback", t, take, status?, comment?, name }  (anyone with the link)
//   GET  /api/studio?fn=review&inbox=1                         (signed in) the studio's latest client feedback
//
// Every client answer also lands in inbox/<studio>.json, so the studio sees a
// badge, and — when RESEND_API_KEY + RESET_FROM are set — the person who shared
// the link gets an email (at most one per link every 10 minutes).
//
// Stored at review/<token>.json. The token is 128 random bits; only files listed
// in that review can be read through it, and only the owner can change its shots.
const { randomBytes } = require("crypto");
const { Readable } = require("stream");
const db = require("./_db");
const T = require("./_team");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

const okToken = t => /^[A-Za-z0-9_-]{20,40}$/.test(String(t || ""));
const path = t => `review/${t}.json`;
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const read = async t => { if (!okToken(t)) return null; const r = await db.readJson(path(t)).catch(() => null); return r && r.value; };
const inboxPath = space => `inbox/${db.fileKey(space)}.json`;
const origin = req => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

async function tellStudio(req, token, r, ids, b, name, text) {
  const space = r.space || r.owner;
  const shot = id => r.shots.findIndex(s => s.id === id) + 1;
  const items = ids.map(id => ({ t: Date.now(), token, proj: r.proj, title: r.title, client: r.client, take: id, shot: shot(id), status: b.status === "approved" || b.status === "changes" ? b.status : null, comment: text, name }));
  if (!items.some(i => i.status || i.comment)) return;
  await T.withLock(`inbox-${db.fileKey(space)}`, async () => {
    const cur = await db.readJson(inboxPath(space)).catch(() => null);
    const list = ((cur && cur.value && cur.value.items) || []);
    const one = b.take === "*" ? [{ ...items[0], shot: 0, take: "*" }] : items; // "approve all" is one line
    await db.writeJson(inboxPath(space), { items: [...one, ...list].slice(0, 300) });
  }).catch(e => console.log("inbox failed:", e.message));
  // email whoever shared the link
  const key = String(process.env.RESEND_API_KEY || "").trim(), from = String(process.env.RESET_FROM || "").trim();
  if (!key || !from || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.owner) || (r.lastMail && Date.now() - r.lastMail < 10 * 60e3)) return;
  r.lastMail = Date.now();
  const what = b.take === "*" ? (b.status === "approved" ? "approved every shot" : "left feedback") : b.status === "approved" ? `approved shot ${shot(ids[0])}` : b.status === "changes" ? `asked for changes on shot ${shot(ids[0])}` : `commented on shot ${shot(ids[0])}`;
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({
    from, to: r.owner, subject: `${name} ${what} — ${r.title}`,
    html: `<p><b>${esc(name)}</b> ${esc(what)} in <b>${esc(r.title)}</b>${r.client ? " (" + esc(r.client) + ")" : ""}.</p>${text ? `<blockquote>${esc(text)}</blockquote>` : ""}<p><a href="${origin(req)}/generation">Open Illume Studio</a></p>`,
  }) }).then(x => { if (!x.ok) console.log("review email failed:", x.status); }).catch(e => console.log("review email failed:", e.message));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  try {
    if (req.method === "GET" && q.inbox) {
      const user = await db.requireUser(req, res); if (!user) return;
      const c = await T.ctx(user);
      const cur = await db.readJson(inboxPath(c.space)).catch(() => null);
      return res.status(200).json({ items: ((cur && cur.value && cur.value.items) || []).slice(0, 100) });
    }
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
        title: r.title, client: r.client, recipient: r.recipient || "", updated: r.updated,
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
      await tellStudio(req, b.t, r, takes, b, name, text);
      await db.writeJson(path(b.t), r);
      return res.status(200).json({ ok: true, feedback: r.feedback });
    }

    const user = await db.requireUser(req, res); if (!user) return;
    const c = await T.ctx(user);
    if (b.action === "revoke") {
      const r = await read(b.token);
      if (r && (r.owner === user.name || (c.teamRole !== "viewer" && (r.space || r.owner) === c.space))) await blob.del(path(b.token));
      return res.status(200).json({ ok: true });
    }
    if (b.action === "publish") {
      if (c.teamRole === "viewer") return res.status(403).json({ error: "Viewers can't share review links — ask an editor." });
      const mine = `media/${db.fileKey(user.name)}/`;
      const list = (Array.isArray(b.shots) ? b.shots : []).slice(0, 200).filter(s => s && typeof s.path === "string" && !s.path.includes(".."));
      const okPath = await Promise.all(list.map(s => s.path.startsWith(mine) || T.canReadMedia(user, s.path))); // your shots, or your team's
      const shots = list.filter((s, i) => okPath[i])
        .map(s => ({ id: clean(s.id, 80), path: s.path, mode: ["image", "video", "audio"].includes(s.mode) ? s.mode : "image", dur: Number(s.dur) || null, note: clean(s.note, 500) }));
      if (!shots.length) return res.status(400).json({ error: "No saved shots to share yet — shots appear here once they're saved." });
      let token = okToken(b.token) ? b.token : null, prev = token ? await read(token) : null;
      if (prev && prev.owner !== user.name && (prev.space || prev.owner) !== c.space) { token = null; prev = null; }
      if (!token) token = randomBytes(16).toString("base64url");
      const r = { owner: (prev && prev.owner) || user.name, space: c.space, proj: clean(b.proj, 80), title: clean(b.title, 120) || "Storyboard", client: clean(b.client, 120), recipient: clean(b.recipient, 120).replace(/@.*/, ""), shots, feedback: (prev && prev.feedback) || {}, created: (prev && prev.created) || Date.now(), updated: Date.now() };
      await db.writeJson(path(token), r);
      return res.status(200).json({ token });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.log("review failed:", e.message);
    res.status(502).json({ error: e.message });
  }
};
