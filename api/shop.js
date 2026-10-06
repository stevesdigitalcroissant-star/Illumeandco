// GET /api/shop → what the shop page needs live: sold-out items and whether ordering is paused.
const { getSettings } = require("./_lib");

module.exports = async (req, res) => {
  const s = await getSettings().catch(() => ({ soldOut: [], paused: false }));
  res.setHeader("Cache-Control", "no-store");
  res.json({ soldOut: s.soldOut, paused: s.paused, pauseMsg: s.pauseMsg || "" });
};
