// Each signed-in person's studio work — projects, reel, drafts, saved prompts,
// pinned models, in-flight generations — kept on the server, separately per
// account, so it follows them to any device and never mixes with anyone else's.
//   GET  /api/data                      → { data: { key: value, … } }
//   POST /api/data { set: { key: value|null, … } }   (null deletes the key)
// Stored as one private Blob file per person (data/<name>.json). Only the
// studio's own keys are accepted, and the file is size-capped.
const db = require("./_db");

const ALLOWED = /^il\.(clients|projects|proj|hist|presets|pending|imported|favs4\.(image|video|audio)|model\.(image|video|audio)|draft\.[\w-]{1,40})$/;
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

    // Merge the changed keys into the saved file and write it back.
    // (No ETag check: the ETag a read returns isn't the form a conditional
    // write accepts, so every save after the first was refused as a conflict.
    // Only the keys this save changed are replaced, so two tabs still don't
    // wipe each other's other work.)
    const r = await db.readJson(file);
    const data = (r && r.value) || {};
    for (const [k, v] of set) { if (v === null) delete data[k]; else data[k] = v; }
    if (JSON.stringify(data).length > MAX_FILE) return res.status(413).json({ error: "Your saved work is too large — clear an old reel." });
    await db.writeJson(file, data);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.log("data failed:", e.message);
    res.status(503).json({ error: e.message });
  }
};
