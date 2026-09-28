// Each signed-in person's studio work — projects, reel, drafts, saved prompts,
// pinned models, in-flight generations — kept on the server, separately per
// account, so it follows them to any device and never mixes with anyone else's.
//   GET  /api/data                      → { data: { key: value, … } }
//   POST /api/data { set: { key: value|null, … } }   (null deletes the key)
// Stored as one private Blob file per person (data/<name>.json). Only the
// studio's own keys are accepted, and the file is size-capped.
const db = require("./_db");

const ALLOWED = /^il\.(projects|proj|hist|presets|pending|imported|favs4\.(image|video|audio)|model\.(image|video|audio)|draft\.[\w-]{1,40})$/;
const MAX_FILE = 3 * 1024 * 1024; // a whole reel of 150 items is far below this

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const user = await db.requireUser(req, res);
  if (!user) return;
  const file = `data/${db.fileKey(user.name)}.json`;
  try {
    if (req.method === "GET") {
      const r = await db.readJson(file);
      return res.status(200).json({ data: (r && r.value) || {} });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } } // sendBeacon may post text
    const set = Object.entries((body && body.set) || {}).filter(([k]) => ALLOWED.test(k));
    if (!set.length) return res.status(200).json({ ok: true });

    // Merge into the saved file. ifMatch makes two tabs saving at once retry
    // instead of one silently wiping the other's change.
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await db.readJson(file);
      const data = (r && r.value) || {};
      for (const [k, v] of set) { if (v === null) delete data[k]; else data[k] = v; }
      if (JSON.stringify(data).length > MAX_FILE) return res.status(413).json({ error: "Your saved work is too large — clear an old reel." });
      try {
        await db.writeJson(file, data, r && r.etag ? { ifMatch: r.etag } : { overwrite: !!r });
        return res.status(200).json({ ok: true });
      } catch (e) { if (!db.alreadyExists(e)) throw e; } // someone saved in between — re-read and merge again
    }
    res.status(409).json({ error: "Couldn't save — too many changes at once. Retrying." });
  } catch (e) {
    console.log("data failed:", e.message);
    res.status(503).json({ error: e.message });
  }
};
