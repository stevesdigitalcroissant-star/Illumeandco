const { checkAccess, apiKey, atlas } = require("./_atlas");

module.exports = async (req, res) => {
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
  if (!key) return;
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id." });
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
    res.status(502).json({ error: e.message });
  }
};
