const { checkAccess, apiKey, atlas } = require("./_atlas");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
  if (!key) return;

  const { mode, model, prompt, image_url, params } = req.body || {};
  if (!model || !prompt) return res.status(400).json({ error: "Model and prompt are required." });

  const PATHS = { image: "/model/generateImage", video: "/model/generateVideo", audio: "/model/generateAudio" };
  const path = PATHS[mode] || PATHS.image;
  // Audio models take `text`; image/video models take `prompt`.
  const body = mode === "audio" ? { model, text: prompt, ...(params || {}) } : { model, prompt, ...(params || {}) };
  if (image_url) body.image_url = image_url;
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
    res.status(502).json({ error: e.message });
  }
};
