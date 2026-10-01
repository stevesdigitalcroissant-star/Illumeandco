// Tiny sink for client-side errors so they show up in Vercel's runtime logs —
// the browser console isn't visible server-side, and some failures never reach
// another endpoint. Fire-and-forget from the page; logs and returns 204.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch {} }
    console.log("CLIENT ERROR:", JSON.stringify(body).slice(0, 800));
  } catch {}
  res.status(204).end();
};
