// Each signed-in person's studio work — projects, reel, drafts, saved prompts,
// pinned models, in-flight generations — kept on the server, separately per
// account, so it follows them to any device and never mixes with anyone else's.
//   GET  /api/data                      → { data: { key: value, … } }
//   POST /api/data { set: { key: value|null, … } }   (null deletes the key)
// Only the studio's own keys are accepted, each capped in size.
const db = require("./_db");

const ALLOWED = /^il\.(projects|proj|hist|presets|pending|imported|favs4\.(image|video|audio)|model\.(image|video|audio)|draft\.[\w-]{1,40})$/;
const MAX_VALUE = 900 * 1024; // per key; the whole reel of 150 items is far below this

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const user = await db.requireUser(req, res);
  if (!user) return;
  const key = "data:" + user.name;
  try {
    if (req.method === "GET") {
      const raw = db.pairs(await db.cmd("HGETALL", key));
      const data = {};
      for (const [k, v] of Object.entries(raw)) { try { data[k] = JSON.parse(v); } catch {} }
      return res.status(200).json({ data });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } } // sendBeacon posts text/plain
    const set = (body && body.set) || {};
    const put = [], del = [];
    for (const [k, v] of Object.entries(set)) {
      if (!ALLOWED.test(k)) continue;
      if (v === null) { del.push(k); continue; }
      const s = JSON.stringify(v);
      if (s.length > MAX_VALUE) return res.status(413).json({ error: `"${k}" is too large to save.` });
      put.push(k, s);
    }
    if (put.length) await db.cmd("HSET", key, ...put);
    if (del.length) await db.cmd("HDEL", key, ...del);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.log("data failed:", e.message);
    res.status(503).json({ error: e.message });
  }
};
