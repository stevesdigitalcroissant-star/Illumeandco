// Stripe calls this when a payment succeeds. It marks the order / booking as paid and sends the emails.
// In Stripe: Developers → Webhooks → add endpoint https://<your-domain>/api/stripe-webhook
// with the event "checkout.session.completed", then put its signing secret in STRIPE_WEBHOOK_SECRET.
const L = require("./_lib");

const rawBody = (req) => new Promise((ok, fail) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c).toString("utf8"))); req.on("error", fail); });

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const raw = await rawBody(req);
  if (!L.verifyStripe(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).send("bad signature");
  const event = JSON.parse(raw);
  if (event.type !== "checkout.session.completed") return res.json({ ok: true });

  const s = event.data.object, path = s.metadata && s.metadata.path;
  if (!path || !/^(orders|requests)\/[A-Z]{2}-[A-Z0-9]{5}\.json$/.test(path) || s.payment_status !== "paid") return res.json({ ok: true });
  const doc = await L.readJson(path);
  if (!doc || doc.status === "paid" || doc.paidAt) return res.json({ ok: true }); // already handled (Stripe retries)

  doc.status = doc.kind === "order" ? "paid" : "confirmed";
  doc.paidAt = new Date().toISOString();
  doc.paidAmount = s.amount_total;
  await L.writeJson(path, doc);

  const C = L.CONFIG, chefTo = process.env.ORDER_EMAIL;
  try {
    if (doc.kind === "order") {
      const when = `${L.frDate(doc.pickup.date)} à ${doc.pickup.time}`;
      const body = `${L.linesTable(doc.lines)}<p style="text-align:right;font-size:16px"><b>Total payé : ${L.euro(doc.total)}</b></p>`;
      await L.sendMail(doc.customer.email, `Commande ${doc.id} confirmée — retrait ${when}`, L.mailLayout("Merci, c'est confirmé !",
        `<p>Bonjour ${L.esc(doc.customer.name)},</p><p>Votre commande <b>${doc.id}</b> est payée. On vous attend <b>${L.esc(when)}</b> :<br>${L.esc(C.market.name)} — ${L.esc(C.market.address)}</p>${body}<p>Présentez simplement votre numéro de commande au stand.</p>`));
      await L.sendMail(chefTo, `🛎️ Nouvelle commande ${doc.id} — ${when}`, L.mailLayout(`Nouvelle commande ${doc.id}`,
        `<p><b>${L.esc(doc.customer.name)}</b> · ${L.esc(doc.customer.phone)} · ${L.esc(doc.customer.email)}<br>Retrait : <b>${L.esc(when)}</b></p>${doc.note ? `<p>Note : « ${L.esc(doc.note)} »</p>` : ""}${body}`));
    } else {
      const what = doc.kind === "chef" ? "votre réservation de cheffe à domicile" : "votre commande traiteur";
      await L.sendMail(doc.customer.email, `${doc.id} confirmé — merci !`, L.mailLayout("C'est confirmé !",
        `<p>Bonjour ${L.esc(doc.customer.name)},</p><p>Nous avons bien reçu votre paiement de <b>${L.euro(s.amount_total)}</b> pour ${what} du <b>${L.esc(L.frDate(doc.date))}</b>. ${doc.kind === "chef" ? "La cheffe vous appellera quelques jours avant pour caler les derniers détails." : "On vous recontacte pour l'heure exacte de retrait."}</p>`));
      await L.sendMail(chefTo, `✅ ${doc.id} payé (${L.euro(s.amount_total)})`, L.mailLayout(`${doc.id} est confirmé`,
        `<p>${L.esc(doc.customer.name)} a payé ${L.euro(s.amount_total)} pour le ${L.esc(L.frDate(doc.date))}.</p>`));
      if (doc.kind === "chef" && process.env.SAFETY_EMAIL) {
        await L.sendMail(process.env.SAFETY_EMAIL, `Prestation confirmée — ${L.frDate(doc.date)}`, L.mailLayout("Prestation de la cheffe confirmée",
          `<p>Pour information (contact de confiance) :</p><p><b>${L.esc(L.frDate(doc.date))}, ${L.esc(doc.time)}</b> (${doc.hours} h)<br>${L.esc(doc.address)}, ${L.esc(doc.postcode)} ${L.esc(doc.city)}<br>Client : ${L.esc(doc.customer.name)} · ${L.esc(doc.customer.phone)}<br>${doc.guests} invités · ${L.esc(doc.venueLabel)}</p>`));
      }
    }
  } catch (e) { console.error("mail", e); }
  res.json({ ok: true });
};
module.exports.config = { api: { bodyParser: false } };
