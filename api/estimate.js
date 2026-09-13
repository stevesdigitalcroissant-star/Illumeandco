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
    console.log("calculate response shape:", JSON.stringify(out).slice(0, 500));
    // Checking out.data.* too — the uploadMedia endpoint's docs disagreed with
    // themselves about a flat vs. nested response, so this one isn't trusted blind either.
    const d = out?.data || out;
    const price = d.price ?? d.origin_price ?? null;
    res.status(200).json({
      price,
      origin_price: d.origin_price ?? null,
      discount: d.discount ?? null,
      estimated: !!d.estimated,
      estimated_tokens: d.estimated_tokens ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
