const { checkAccess, apiKey, atlas } = require("./_atlas");

module.exports = async (req, res) => {
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
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
    const outputs = (d.outputs || []).map(o => (typeof o === "string" ? o : (o?.url || o?.download_url || o?.output_url || o)));
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
      return res.status(200).json({ status: "failed", outputs: [], error: m });
    }
    res.status(502).json({ error: e.message });
  }
};
