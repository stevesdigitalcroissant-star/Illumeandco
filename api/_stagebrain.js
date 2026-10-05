// Stage from words: describe a shot in plain language, Claude lays out the 3D set.
//
//   POST /api/studio?fn=stage { text, scene? }  (signed in)
//     text  — "a woman at a café table with a coffee cup, start wide, slow dolly in to a close-up on 85mm"
//     scene — the current set, so a follow-up like "make it a low angle" changes it instead of starting over
//   → { scene: { objects:[…], keys:[…], dur, notes } }   in the Stage's own units (metres, y up)
//
// Needs ANTHROPIC_API_KEY in Vercel. Each build is one Claude request at low effort.
const sdk = require("@anthropic-ai/sdk");
const Anthropic = sdk.default || sdk;
const db = require("./_db");

const KINDS = ["person", "bottle", "box", "can", "table", "chair", "wall"];
const LENSES = [16, 24, 35, 50, 85, 135];
const vec = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }, required: ["x", "y", "z"], additionalProperties: false };
const SCHEMA = {
  type: "object",
  properties: {
    objects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: KINDS },
          label: { type: "string" },
          x: { type: "number" }, z: { type: "number" },
          on_table: { type: "boolean" },
          pose: { type: "string", enum: ["standing", "sitting"] },
          facing_deg: { type: "number" },
          scale: { type: "number" },
        },
        required: ["kind", "label", "x", "z", "on_table", "pose", "facing_deg", "scale"],
        additionalProperties: false,
      },
    },
    keys: {
      type: "array",
      items: { type: "object", properties: { camera: vec, look_at: vec, lens_mm: { type: "integer", enum: LENSES } }, required: ["camera", "look_at", "lens_mm"], additionalProperties: false },
    },
    duration_s: { type: "number" },
    notes: { type: "string" },
  },
  required: ["objects", "keys", "duration_s", "notes"],
  additionalProperties: false,
};

const SYSTEM = `You lay out film shots on a simple 3D set for a commercial video studio. The person describes a shot; you return the set and the camera.

The set, in metres: y is up and the floor is y = 0. Put the main subject near the origin. The default camera stands on the +z side looking toward -z, so x is left (-) / right (+) as seen from the camera, and -z is further from the camera (background).
Stand-ins and their sizes: person (pose "standing" is 1.75 tall, "sitting" is 1.3 tall with the seat at 0.46 — put a sitting person on a chair's x/z, or just behind a table; pose is "standing" for everything that isn't a person, about 0.45 wide; facing_deg 0 faces the camera, 90 faces camera-left… they turn around the vertical axis), table (1.2 wide × 0.7 deep, top at 0.75), chair (seat 0.46 high), bottle (0.3 tall), can (0.12 tall), box (0.2 cube), wall (4 wide × 2.6 tall, 0.08 thick; put it behind the subject as a backdrop, facing_deg 0). Set on_table true for small props standing on the table (their x/z must be within the table's footprint). Use scale only for size changes (1 = normal). Give each object a short label from the description (e.g. "Mia", "the latte", "café table"). Keep at least 0.5 m between people and furniture so nothing overlaps.

The camera: a list of key positions in order — the first is the start of the shot, the last the end; 1 key means a locked-off static shot, 2 keys a simple move, up to 4 for a curved path. Each key has the camera position, the point it looks at, and a lens (16, 24, 35, 50, 85 or 135 mm). Eye level is about 1.5 m for a standing subject, 1.1 m for a seated one; a low angle puts the camera at 0.3–0.8 m looking up, a high angle 2.5 m+ looking down. Shot sizes on a 50 mm lens, roughly: wide/full shot of a person 4–6 m away, medium 2–2.5 m, close-up 1–1.3 m; a product close-up 0.4–0.8 m. Longer lenses need more distance for the same framing. Dolly in = the camera moves toward the subject; orbit/arc = it circles around the look-at point; crane = it rises or descends; pan = the camera stays put and only the look-at point moves; zoom = only the lens changes.
duration_s is the length of the move in seconds (2–30; default 5 if not said).
If the person names no move, choose a tasteful one that suits the shot. If a current set is given, apply the requested change to it and keep everything else the same.
notes: one or two short sentences in plain language saying what you set up and any guess you made.`;

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

// Claude's layout → the Stage's own format, clamped to sane values.
function toStage(out) {
  const objs = (Array.isArray(out.objects) ? out.objects : []).filter(o => KINDS.includes(o.kind)).slice(0, 24);
  const table = objs.find(o => o.kind === "table");
  const objects = objs.map((o, i) => {
    const sc = num(o.scale, 1, 0.2, 5), x = num(o.x, 0, -15, 15), z = num(o.z, 0, -15, 15);
    const y = o.on_table && table && o.kind !== "table" ? 0.75 * num(table.scale, 1, 0.2, 5) : 0;
    return { id: "o" + Date.now().toString(36) + i, kind: o.kind, label: clean(o.label, 40) || o.kind, ...(o.kind === "person" && o.pose === "sitting" ? { pose: "sitting" } : {}), pos: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], rotY: +(num(o.facing_deg, 0, -360, 360) * Math.PI / 180).toFixed(3), scale: +sc.toFixed(2) };
  });
  const P = v => [+num(v && v.x, 0, -30, 30).toFixed(2), +num(v && v.y, 1.5, 0.05, 30).toFixed(2), +num(v && v.z, 3, -30, 30).toFixed(2)];
  const keys = (Array.isArray(out.keys) ? out.keys : []).slice(0, 4).map(k => ({ pos: P(k.camera), target: [P(k.look_at)[0], num(k.look_at && k.look_at.y, 1, 0, 30), P(k.look_at)[2]], mm: LENSES.includes(k.lens_mm) ? k.lens_mm : 35 }));
  return { objects, keys, dur: Math.round(num(out.duration_s, 5, 2, 30)), notes: clean(out.notes, 400) };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const user = await db.requireUser(req, res); if (!user) return;
  if (!String(process.env.ANTHROPIC_API_KEY || "").trim()) return res.status(503).json({ error: "Building from a description isn't switched on yet — the studio owner needs to add ANTHROPIC_API_KEY in Vercel.", setup: true });
  if (!db.underLimit("stagebrain:" + user.name, 40, 3600)) return res.status(429).json({ error: "That's a lot of builds this hour — try again in a little while." });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  const text = clean(b.text, 1500); if (!text) return res.status(400).json({ error: "Describe the shot first." });
  // The current set, trimmed to what matters, so a follow-up edits it rather than starting over.
  let current = "";
  if (b.scene && Array.isArray(b.scene.objects) && b.scene.objects.length) {
    const sc = b.scene;
    current = JSON.stringify({
      objects: sc.objects.slice(0, 24).map(o => ({ kind: o.kind, label: clean(o.label, 40), pose: o.pose || "standing", x: o.pos && o.pos[0], y: o.pos && o.pos[1], z: o.pos && o.pos[2], facing_deg: Math.round((Number(o.rotY) || 0) * 180 / Math.PI), scale: o.scale })),
      keys: (sc.keys || []).slice(0, 4).map(k => ({ camera: k.pos, look_at: k.target, lens_mm: k.mm })),
      duration_s: sc.dur,
    });
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if a request is declined, the API retries it on its recommended fallback model
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: (current ? `Current set (change it as asked, keep the rest):\n${current}\n\nChange: ` : "Shot: ") + text }],
    });
    if (response.stop_reason === "refusal") return res.status(422).json({ error: "Claude couldn't set up that shot — try describing it differently." });
    if (response.stop_reason === "max_tokens") return res.status(502).json({ error: "The description was too complex to lay out — try a simpler shot." });
    const block = response.content.find(c => c.type === "text");
    let out; try { out = JSON.parse(block && block.text); } catch { return res.status(502).json({ error: "Claude's layout came back unreadable — try again." }); }
    const scene = toStage(out);
    if (!scene.objects.length && !scene.keys.length) return res.status(422).json({ error: "Claude couldn't find a shot in that — describe who or what is in it and how the camera moves." });
    console.log("stage build:", user.name, scene.objects.length, "objects,", scene.keys.length, "keys | tokens", response.usage && response.usage.input_tokens, "/", response.usage && response.usage.output_tokens);
    res.status(200).json({ scene });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: "The Anthropic API key in Vercel isn't valid — check ANTHROPIC_API_KEY.", setup: true });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Claude is busy right now — try again in a minute." });
    if (e instanceof Anthropic.BadRequestError) { console.log("stage build 400:", e.message); return res.status(502).json({ error: "Claude couldn't read that request: " + e.message }); }
    if (e instanceof Anthropic.APIError) { console.log("stage build failed:", e.status, e.message); return res.status(502).json({ error: "Claude couldn't be reached — try again." }); }
    console.log("stage build failed:", e.message);
    res.status(502).json({ error: e.message });
  }
};
module.exports.toStage = toStage;
