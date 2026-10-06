// POST /api/order → creates a click-and-collect order and returns a Stripe Checkout URL.
// GET  /api/order?id=…&t=… → the customer's view of their order (used on the thank-you screen).
const L = require("./_lib");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const { id, t } = req.query || {};
    const o = /^MS-[A-Z0-9]{5}$/.test(id || "") ? await L.readJson(`orders/${id}.json`) : null;
    if (!o || o.token !== t) return res.status(404).json({ error: "Commande introuvable." });
    return res.json({ id: o.id, status: o.status, pickup: o.pickup, lines: o.lines, total: o.total, name: o.customer.name });
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!L.rateOk(req, 15)) return res.status(429).json({ error: "Trop de tentatives, réessayez dans quelques minutes." });
  if (!L.storeReady() || !process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: "La commande en ligne n'est pas encore activée." });

  try {
    const b = req.body || {};
    const settings = await L.getSettings();
    if (settings.paused) throw new Error(settings.pauseMsg || "Les commandes sont en pause pour le moment.");
    const name = L.clean(b.name, 80), email = L.clean(b.email, 120).toLowerCase(), phone = L.clean(b.phone, 30);
    if (name.length < 2) throw new Error("Indiquez votre nom.");
    if (!L.validEmail(email)) throw new Error("Adresse e-mail invalide.");
    if (!L.validPhone(phone)) throw new Error("Numéro de téléphone invalide.");
    const slotErr = L.slotError(b.date, b.time);
    if (slotErr) throw new Error(slotErr);
    const { lines, total } = L.priceCart(b.lines, settings.soldOut);
    if (total < 500) throw new Error("Commande minimum : 5 €.");

    const order = {
      kind: "order", id: L.code("MS"), token: L.token(), status: "awaiting_payment", created: new Date().toISOString(),
      pickup: { date: b.date, time: b.time }, customer: { name, email, phone }, note: L.clean(b.note, 300), lines, total,
    };
    const base = L.baseUrl(req);
    const session = await L.checkoutSession({
      lines: lines.map((l) => ({ name: l.name + (l.opts.length ? ` (${l.opts.join(", ")})` : ""), amount: l.unit, qty: l.qty })),
      email,
      metadata: { path: `orders/${order.id}.json`, id: order.id },
      successUrl: `${base}/#/merci?id=${order.id}&t=${order.token}`,
      cancelUrl: `${base}/#/panier`,
    });
    order.stripeSession = session.id;
    await L.writeJson(`orders/${order.id}.json`, order);
    res.json({ url: session.url, id: order.id });
  } catch (e) {
    const msg = e.message === "STORE_NOT_READY" || e.message === "STRIPE_NOT_READY" ? "La commande en ligne n'est pas encore activée." : e.message;
    res.status(400).json({ error: msg });
  }
};
