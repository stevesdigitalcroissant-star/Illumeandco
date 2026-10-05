// Starting a generation: build the request, charge credits for members (refunded
// if Atlas refuses), send it to Atlas. Shared by /api/generate and the Claude
// connection (/api/mcp), so both behave exactly the same.
const { atlas, buildBody } = require("./_atlas");
const C = require("./_credits");
const T = require("./_team");

// Returns { id, cost } or throws an Error with .status (and .payload for 402).
async function startJob(user, key, { mode, model, prompt, image_url, params }) {
  if (!model || !prompt) { const e = new Error("Model and prompt are required."); e.status = 400; throw e; }
  const res = {
    _s: 200, _j: null,
    status(c) { this._s = c; return this; },
    json(o) { this._j = o; return this; },
  };
  // In a team the lead's credits are the shared pot; viewers can't generate.
  const team = await T.ctx(user);
  if (team.teamRole === "viewer") { const e = new Error("Viewers can watch and comment — ask the team lead to make you an editor to create."); e.status = 403; throw e; }
  const payer = team.payer;
  await (async () => { // every early "return res.status(…)" below exits only this inner block
  const PATHS = { image: "/model/generateImage", video: "/model/generateVideo", audio: "/model/generateAudio" };
  const path = PATHS[mode] || PATHS.image;
  const body = buildBody(mode, model, prompt, image_url, params);
  const refCount = Array.isArray(image_url) ? image_url.length : (image_url ? 1 : 0);
  if (refCount) {
    // Confirm the edit-endpoint routing + field mapping on every reference run.
    console.log(`generate with ${refCount} ref(s): model ${model} -> ${body.model}, fields=${Object.keys(body).join(",")}`);
  }
  // Members pay in credits: price it with Atlas first, take the credits (locked,
  // so parallel takes can't double-spend), and give them back if Atlas refuses.
  let cost = 0;
  if (C.pays(payer)) {
    try {
      const q = await atlas("/model/calculate", key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = q?.data || q; cost = C.creditsFor(d.price ?? d.origin_price);
    } catch (e) { return res.status(502).json({ error: e.message }); }
    try {
      const who = payer.name !== user.name ? ` · ${user.name}` : "";
      const ok = await C.withWallet(payer.name, w => { if (w.credits < cost) return false; w.credits -= cost; C.entry(w, "spend", -cost, `${mode || "image"} · ${String(prompt).slice(0, 40)}${who}`); return true; });
      if (!ok) { const w = await C.getWallet(payer.name); return res.status(402).json({ error: `This take needs ${cost.toLocaleString()} credits — ${payer.name !== user.name ? "the studio has" : "you have"} ${w.credits.toLocaleString()}.`, need: cost, credits: w.credits }); }
    } catch (e) { return res.status(503).json({ error: e.message }); }
  }
  const refund = async why => { if (cost) await C.withWallet(payer.name, w => { w.credits += cost; C.entry(w, "refund", cost, why); }).catch(() => {}); };
  try {
    const out = await atlas(path, key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const id = out?.data?.id || out?.id || out?.predictionId;
    if (!id) { await refund("Not started — refunded"); return res.status(502).json({ error: "No prediction id returned.", detail: out }); }
    if (cost) await C.withWallet(payer.name, w => { w.holds[id] = cost; }).catch(() => {});
    res.status(200).json({ id, cost });
  } catch (e) {
    console.log("generate failed:", e.message, "| sent:", JSON.stringify({ ...body, prompt: String(body.prompt || body.text || "").slice(0, 60) }).slice(0, 600));
    await refund("Atlas refused it — refunded");
    res.status(502).json({ error: e.message });
  }
  })();
  if (res._s !== 200) { const e = new Error((res._j && res._j.error) || "Generation failed"); e.status = res._s; e.payload = res._j; throw e; }
  return res._j;
}
module.exports = { startJob };
