// Each signed-in person's studio work — projects, reel, drafts, saved prompts,
// pinned models, in-flight generations — kept on the server, so it follows them
// to any device.
//   GET  /api/data                      → { data: { key: value, … } }
//   GET  /api/data?only=shared          → just the studio's shared keys (teams poll this)
//   POST /api/data { set: { key: value|null, … }, base: { key: [ids] } }   (null deletes the key)
//
// In a team (see _team.js) the studio's WORK — clients, projects, takes, saved
// prompts, recently deleted, spending — lives in the lead's file and everyone
// in the team reads and writes it; each person's own things (drafts, pinned
// models, running jobs) stay in their own file. Several people saving the same
// list at once are merged item by item: `base` is the ids that person last saw,
// so an id missing from their list but in their base was deleted by them, and
// one that isn't in their base was added by someone else and is kept.
const db = require("./_db");
const T = require("./_team");

const ALLOWED = /^il\.(clients|mcpseen|trash|projects|proj|hist|presets|pending|imported|spend|activity|inboxSeen|favs4\.(image|video|audio)|model\.(image|video|audio)|draft\.[\w-]{1,40})$/;
const SHARED = /^il\.(clients|projects|hist|presets|trash|spend|activity)$/;
const MAX_FILE = 3 * 1024 * 1024; // a whole reel of 1000 takes is well below this
const fileOf = name => `data/${db.fileKey(name)}.json`;

// item-by-item merge of a list someone saved into the list on the server:
// - an item both have: the more recently changed copy wins (_t, stamped by the page)
// - an item only the server has: kept if this person never saw it (a teammate added it),
//   dropped if it was in their base (they deleted it)
function merge(k, mine, server, base) {
  if (!Array.isArray(mine) || !Array.isArray(server)) return mine;
  const sMap = new Map(server.filter(x => x && x.id).map(x => [x.id, x]));
  let changed = false;
  const out = mine.map(x => { const sv = x && x.id && sMap.get(x.id); if (sv && (sv._t || 0) > (x._t || 0)) { changed = true; return sv; } return x; });
  if (Array.isArray(base)) {
    const ids = new Set(mine.map(x => x && x.id)), seen = new Set(base);
    const theirs = server.filter(x => x && x.id && !ids.has(x.id) && !seen.has(x.id));
    if (theirs.length) { out.push(...theirs); changed = true; }
  }
  if (!changed) return mine;
  if (k === "il.hist" || k === "il.trash" || k === "il.spend" || k === "il.activity") out.sort((a, b) => (b.at || b.started || b.t || 0) - (a.at || a.started || a.t || 0));
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const user = await db.requireUser(req, res);
  if (!user) return;
  try {
    const c = await T.ctx(user);
    const own = fileOf(user.name), space = fileOf(c.space), shared = space !== own;
    if (req.method === "GET") {
      const q = req.query || {};
      // the background checks (only=…) skip this: one Blob read fewer each time; the full load still checks
      if (!q.only && !(await db.getUser(user.name))) { db.endSession(req, res); return res.status(401).json({ error: "This account no longer exists." }); }
      const mf = `mcpdata/${db.fileKey(user.name)}.json`;
      if (q.only === "mcp") { const m = await db.readJson(mf).catch(() => null); return res.status(200).json({ data: { "il.mcp": (m && m.value) || null } }); }
      if (q.only === "shared") {
        const s = await db.readJson(space).catch(() => null), v = (s && s.value) || {};
        return res.status(200).json({ data: Object.fromEntries(Object.entries(v).filter(([k]) => SHARED.test(k))), role: c.teamRole });
      }
      const [r, s, m] = await Promise.all([db.readJson(own), shared ? db.readJson(space).catch(() => null) : null, db.readJson(mf).catch(() => null)]);
      const data = (r && r.value) || {};
      if (shared) {
        for (const k of Object.keys(data)) if (SHARED.test(k)) delete data[k]; // your own studio waits until you leave the team
        Object.entries((s && s.value) || {}).forEach(([k, v]) => { if (SHARED.test(k)) data[k] = v; });
      }
      delete data["il.mcp"];
      if (m && m.value) data["il.mcp"] = m.value; // takes made from Claude (read-only here)
      return res.status(200).json({ data, role: c.teamRole });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } } // sendBeacon may post text
    const base = (body && body.base) || {};
    let set = Object.entries((body && body.set) || {}).filter(([k]) => ALLOWED.test(k));
    if (c.teamRole === "viewer") set = set.filter(([k]) => !SHARED.test(k)); // viewers watch and comment, they don't change the studio
    if (!set.length) return res.status(200).json({ ok: true });

    const merged = {};
    const write = async (file, entries) => {
      if (!entries.length) return;
      const r = await db.readJson(file);
      const data = (r && r.value) || {};
      for (const [k, v] of entries) {
        if (v === null) { delete data[k]; continue; }
        const out = SHARED.test(k) ? merge(k, v, data[k], base[k]) : v;
        if (out !== v) merged[k] = out;
        data[k] = out;
      }
      if (JSON.stringify(data).length > MAX_FILE) { const e = new Error("The studio's saved work is too large — clear some old takes."); e.status = 413; throw e; }
      await db.writeJson(file, data);
    };
    const toSpace = set.filter(([k]) => SHARED.test(k)), toOwn = set.filter(([k]) => !SHARED.test(k));
    if (shared) {
      await T.withLock(`data-${db.fileKey(c.space)}`, () => write(space, toSpace));
      await write(own, toOwn);
    } else if (c.teamRole === "lead") {
      await T.withLock(`data-${db.fileKey(user.name)}`, () => write(own, set)); // teammates write this file too
    } else {
      await write(own, set);
    }
    res.status(200).json({ ok: true, merged });
  } catch (e) {
    console.log("data failed:", e.message);
    res.status(e.status || 503).json({ error: e.message });
  }
};
