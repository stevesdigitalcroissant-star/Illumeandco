const { checkAccess, apiKey, atlas } = require("./_atlas");
const C = require("./_credits");
const T = require("./_team");
// A failed take returns its credits to the member who paid for it — once.
async function refundHold(user, id, why) {
  const { payer } = await T.ctx(user); // in a team, the shared pot paid
  if (!C.pays(payer)) return;
  await C.withWallet(payer.name, w => { const n = w.holds && w.holds[id]; if (!n) return; delete w.holds[id]; w.credits += n; C.entry(w, "refund", n, why); }).catch(e => console.log("refund failed:", e.message));
}

module.exports = async (req, res) => {
  const user = await checkAccess(req, res);
  if (!user) return;
  const key = apiKey(res);
  if (!key) return;
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id." });
  // NEVER cache a status check. Without this the browser/CDN returns 304 and the
  // poll keeps reading a stale "processing" forever — the generation finishes on
  // Atlas but the tool never sees it (looks like it hangs for 10+ minutes).
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const out = await atlas(`/model/prediction/${encodeURIComponent(id)}`, key);
    const d = out?.data || out;
    if (d.status === "completed" || d.status === "succeeded" || d.status === "failed") {
      console.log("prediction terminal response:", JSON.stringify(out).slice(0, 800));
    }
    // Atlas Cloud's own docs say outputs is a plain array of URL strings, but
    // given tonight's track record with this API, don't trust that blind —
    // each entry might come back as an object instead. Unwrap either shape.
    // Some models put the result under a different key (output / urls / images /
    // videos / audio_url…) — accept any of them, so a finished job never reads
    // as "no output" and sits in the pending list forever.
    const raw = [d.outputs, d.output, d.urls, d.images, d.videos, d.audios, d.result, d.url, d.image_url, d.video_url, d.audio_url]
      .find(v => v && (!Array.isArray(v) || v.length));
    const outputs = [].concat(raw || [])
      .map(o => (typeof o === "string" ? o : (o?.url || o?.download_url || o?.output_url || o?.uri || null)))
      .filter(u => typeof u === "string" && /^https?:\/\//i.test(u));
    if (d.status === "failed" || d.status === "canceled" || ((d.status === "completed" || d.status === "succeeded") && !outputs.length)) await refundHold(user, id, "Take failed — refunded");
    res.status(200).json({
      status: d.status,
      outputs,
      error: d.error || null,
    });
  } catch (e) {
    // An Atlas 4xx on a prediction means the JOB ITSELF is bad (e.g. invalid
    // duration/resolution) — it will never complete, so this is terminal, not a
    // transient blip. Report it as a real failure so the poll stops immediately,
    // removes the job from the pending list, and shows the reason — instead of
    // silently retrying a doomed job for two minutes.
    const m = String(e.message || "");
    if (/returned 4\d\d/.test(m)) {
      await refundHold(user, id, "Take failed — refunded");
      return res.status(200).json({ status: "failed", outputs: [], error: m });
    }
    res.status(502).json({ error: e.message });
  }
};
