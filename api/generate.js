const { checkAccess, apiKey } = require("./_atlas");
const { startJob } = require("./_gen");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const user = await checkAccess(req, res);
  if (!user) return;
  const key = apiKey(res);
  if (!key) return;
  try {
    const out = await startJob(user, key, req.body || {});
    res.status(200).json(out);
  } catch (e) {
    res.status(e.status || 502).json(e.payload || { error: e.message });
  }
};
