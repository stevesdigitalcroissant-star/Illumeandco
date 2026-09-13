const { checkAccess, apiKey, atlas, buildBody } = require("./_atlas");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
  if (!key) return;

  const { mode, model, prompt, image_url, params } = req.body || {};
  if (!model || !prompt) return res.status(400).json({ error: "Model and prompt are required." });

  const PATHS = { image: "/model/generateImage", video: "/model/generateVideo", audio: "/model/generateAudio" };
  const path = PATHS[mode] || PATHS.image;
  const body = buildBody(mode, model, prompt, image_url, params);
  const refCount = Array.isArray(image_url) ? image_url.length : (image_url ? 1 : 0);
  if (refCount) {
    // Confirm the edit-endpoint routing + field mapping on every reference run.
    console.log(`generate with ${refCount} ref(s): model ${model} -> ${body.model}, fields=${Object.keys(body).join(",")}`);
  }
  try {
    const out = await atlas(path, key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const id = out?.data?.id || out?.id || out?.predictionId;
    if (!id) return res.status(502).json({ error: "No prediction id returned.", detail: out });
    res.status(200).json({ id });
  } catch (e) {
    console.log("generate failed:", e.message, "| sent:", JSON.stringify({ ...body, prompt: String(body.prompt || body.text || "").slice(0, 60) }).slice(0, 600));
    res.status(502).json({ error: e.message });
  }
};
