const { checkAccess, apiKey, atlas } = require("./_atlas");

// Returns the live model catalogue: [{ id, name, type }]
module.exports = async (req, res) => {
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
  if (!key) return;
  const paths = ["/models", "/../../v1/models"]; // /api/v1/models, then /v1/models
  let last = null;
  for (const p of paths) {
    try {
      const out = await atlas(p, key);
      const list = Array.isArray(out) ? out : (out.data || out.models || out.items || []);
      const models = list.map(m => {
        const id = m.id || m.model || m.name;
        const type = String(m.type || m.modality || m.category || m.task || "").toLowerCase();
        return { id, name: m.display_name || m.displayName || m.title || m.name || id, type, price: m.price || m.pricing || null };
      }).filter(m => m.id);
      if (models.length) return res.status(200).json({ models });
    } catch (e) { last = e.message; }
  }
  res.status(502).json({ error: "Could not load the model list." + (last ? " " + last : "") });
};
