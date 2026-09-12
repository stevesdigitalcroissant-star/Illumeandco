const { checkAccess, apiKey, atlas } = require("./_atlas");

// Receives { name, type, data(base64) } and uploads it to Atlas Cloud media storage.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
  if (!key) return;

  const { name, type, data } = req.body || {};
  if (!data) return res.status(400).json({ error: "No file data." });

  try {
    const buf = Buffer.from(data, "base64");
    const form = new FormData();
    form.append("file", new Blob([buf], { type: type || "image/png" }), name || "upload.png");
    const out = await atlas("/model/uploadMedia", key, { method: "POST", body: form });
    const url = out?.url || out?.data?.url;
    if (!url) return res.status(502).json({ error: "Upload returned no URL.", detail: out });
    res.status(200).json({ url });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
