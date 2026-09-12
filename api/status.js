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
    res.status(200).json({
      status: d.status,
      outputs: d.outputs || [],
      error: d.error || null,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
