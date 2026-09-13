const { checkAccess, apiKey, atlas, buildBody } = require("./_atlas");

// Atlas Cloud's price calculator: same request body as a real generation,
// but /model/calculate only prices it — no job is created, nothing is charged.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
  if (!key) return;

  const { mode, model, prompt, image_url, params } = req.body || {};
  if (!model) return res.status(400).json({ error: "Model is required." });
  const body = buildBody(mode, model, prompt, image_url, params);

  try {
    const out = await atlas("/model/calculate", key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    res.status(200).json({
      price: out.price,
      origin_price: out.origin_price,
      discount: out.discount,
      estimated: !!out.estimated,
      estimated_tokens: out.estimated_tokens ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
