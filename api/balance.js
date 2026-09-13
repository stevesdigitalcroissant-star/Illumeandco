const { checkAccess, apiKey, atlas, PUBLIC_BASE } = require("./_atlas");

// Atlas Cloud's account balance — a different base path (/public/v1) than
// every other endpoint here (/api/v1), so it's passed explicitly to atlas().
module.exports = async (req, res) => {
  if (!checkAccess(req, res)) return;
  const key = apiKey(res, req);
  if (!key) return;
  try {
    const out = await atlas("/balance", key, {}, PUBLIC_BASE);
    res.status(200).json({ value: Number(out.value), currency: out.currency || "usd" });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
