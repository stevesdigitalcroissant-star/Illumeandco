// Small studio endpoints share one function (Vercel's free plan allows 12):
//   /api/studio?fn=balance | models | estimate | clientlog | review
// Each handler lives in its own _file so it stays readable.
const HANDLERS = {
  balance: require("./_balance"),
  models: require("./_models"),
  estimate: require("./_estimate"),
  clientlog: require("./_clientlog"),
  review: require("./_review"),
};
module.exports = (req, res) => {
  const h = HANDLERS[String(req.query.fn || "")];
  if (!h) return res.status(404).json({ error: "Unknown function." });
  return h(req, res);
};
