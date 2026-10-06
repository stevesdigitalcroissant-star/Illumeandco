// The chef's space. Everything except login needs the signed cookie.
//   POST {action:"login", password}          → sets the cookie
//   POST {action:"logout"}
//   GET                                      → orders, requests, settings
//   POST {action:"status", id, status}       → move an order along (preparing / ready / collected / cancelled)
//   POST {action:"accept", id, amount, message} → accept a request, email the client a payment link
//   POST {action:"decline", id, message}
//   POST {action:"checkin", id, phase}       → "arrived" / "done" at a private-chef event (emails the safety contact)
//   POST {action:"settings", soldOut, paused, pauseMsg}
const L = require("./_lib");

const ORDER_STATUSES = ["paid", "preparing", "ready", "collected", "cancelled"];
const pathFor = (id) => (/^MS-[A-Z0-9]{5}$/.test(id) ? `orders/${id}.json` : /^(CP|TR)-[A-Z0-9]{5}$/.test(id) ? `requests/${id}.json` : null);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const b = req.method === "POST" ? req.body || {} : {};

  if (b.action === "login") {
    if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: "Définissez ADMIN_PASSWORD dans Vercel pour activer l'espace cheffe." });
    if (!L.rateOk(req, 10, 900) || !L.passwordOk(b.password)) return res.status(401).json({ error: "Mot de passe incorrect." });
    res.setHeader("Set-Cookie", L.cookieHeader(L.signSession(), 30 * 86400));
    return res.json({ ok: true });
  }
  if (b.action === "logout") { res.setHeader("Set-Cookie", L.cookieHeader("", 0)); return res.json({ ok: true }); }
  if (!L.isAdmin(req)) return res.status(401).json({ error: "login" });

  if (req.method === "GET") {
    const [orders, requests, settings] = await Promise.all([L.listJson("orders/", 400), L.listJson("requests/", 200), L.getSettings()]);
    return res.json({
      orders: orders.filter((o) => o.status !== "awaiting_payment" || Date.now() - Date.parse(o.created) < 864e5),
      requests, settings,
      setup: { store: L.storeReady(), stripe: !!process.env.STRIPE_SECRET_KEY, webhook: !!process.env.STRIPE_WEBHOOK_SECRET, mail: !!process.env.RESEND_API_KEY, orderEmail: !!process.env.ORDER_EMAIL, safety: !!process.env.SAFETY_EMAIL },
      today: L.parisNow().date,
    });
  }
  if (req.method !== "POST") return res.status(405).end();

  try {
    if (b.action === "settings") {
      const ids = new Set(L.MENU.items.map((i) => i.id));
      const s = { soldOut: (b.soldOut || []).filter((x) => ids.has(x)), paused: !!b.paused, pauseMsg: L.clean(b.pauseMsg, 200) };
      await L.writeJson("settings.json", s);
      return res.json({ ok: true, settings: s });
    }

    const path = pathFor(b.id);
    const doc = path && (await L.readJson(path));
    if (!doc) return res.status(404).json({ error: "Introuvable." });

    if (b.action === "status") {
      if (doc.kind !== "order" || !ORDER_STATUSES.includes(b.status)) throw new Error("Statut invalide.");
      doc.status = b.status;
      doc[b.status + "At"] = new Date().toISOString();
      await L.writeJson(path, doc);
      if (b.status === "ready") {
        await L.sendMail(doc.customer.email, `Votre commande ${doc.id} est prête 🌞`, L.mailLayout("C'est prêt !",
          `<p>Bonjour ${L.esc(doc.customer.name)}, votre commande <b>${doc.id}</b> vous attend au stand : ${L.esc(L.CONFIG.market.name)}.</p>`)).catch(() => {});
      }
      return res.json({ ok: true, doc });
    }

    if (b.action === "accept") {
      if (doc.kind === "order" || !["pending", "accepted"].includes(doc.status)) throw new Error("Cette demande ne peut plus être acceptée.");
      const amount = Math.round(Number(b.amount));
      if (!(amount >= 1000 && amount <= 2000000)) throw new Error("Indiquez le prix total (au moins 10 €).");
      const isChef = doc.kind === "chef";
      const due = isChef ? Math.round((amount * L.CONFIG.privateChef.depositPercent) / 100) : amount;
      const base = L.baseUrl(req);
      const session = await L.checkoutSession({
        lines: [{ name: isChef ? `Acompte ${L.CONFIG.privateChef.depositPercent} % — Cheffe à domicile, ${L.frDate(doc.date)} (${doc.id})` : `Commande traiteur ${doc.id} — ${L.frDate(doc.date)}`, amount: due, qty: 1 }],
        email: doc.customer.email,
        metadata: { path, id: doc.id },
        successUrl: `${base}/#/merci?req=${doc.id}`,
        cancelUrl: `${base}/`,
      });
      Object.assign(doc, { status: "accepted", quote: amount, due, payUrl: session.url, acceptedAt: new Date().toISOString(), chefMessage: L.clean(b.message, 1000) });
      await L.writeJson(path, doc);
      await L.sendMail(doc.customer.email, `Bonne nouvelle : ${doc.id} accepté !`, L.mailLayout("La cheffe a dit oui 🎉",
        `<p>Bonjour ${L.esc(doc.customer.name)},</p>${doc.chefMessage ? `<p style="background:#fff6e5;padding:12px;border-radius:10px">« ${L.esc(doc.chefMessage)} »</p>` : ""}
         <p>Prix total : <b>${L.euro(amount)}</b>${isChef ? `<br>Acompte à régler maintenant (${L.CONFIG.privateChef.depositPercent} %) : <b>${L.euro(due)}</b><br>Le solde sera réglé le jour de la prestation.` : ""}</p>
         <p><a href="${session.url}" style="display:inline-block;background:#e8590c;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Payer ${L.euro(due)} et confirmer</a></p>
         <p style="color:#7a6e5d;font-size:13px">Le lien est valable 23 h. Passé ce délai, répondez à cet e-mail pour en recevoir un nouveau.</p>`));
      return res.json({ ok: true, doc });
    }

    if (b.action === "decline") {
      if (doc.kind === "order") throw new Error("Action impossible.");
      Object.assign(doc, { status: "declined", declinedAt: new Date().toISOString(), chefMessage: L.clean(b.message, 1000) });
      await L.writeJson(path, doc);
      await L.sendMail(doc.customer.email, `Votre demande ${doc.id}`, L.mailLayout("Merci pour votre demande",
        `<p>Bonjour ${L.esc(doc.customer.name)},</p><p>Malheureusement, la cheffe ne peut pas accepter cette demande${doc.date ? ` pour le ${L.esc(L.frDate(doc.date))}` : ""}.</p>${doc.chefMessage ? `<p>« ${L.esc(doc.chefMessage)} »</p>` : ""}<p>Rien n'a été débité. À bientôt au marché !</p>`)).catch(() => {});
      return res.json({ ok: true, doc });
    }

    if (b.action === "checkin") {
      if (doc.kind !== "chef" || !["arrived", "done"].includes(b.phase)) throw new Error("Action impossible.");
      const at = new Date().toISOString();
      doc[b.phase + "At"] = at;
      await L.writeJson(path, doc);
      const time = new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      if (process.env.SAFETY_EMAIL) {
        const [h, m] = doc.time.split(":").map(Number);
        const endMin = h * 60 + m + doc.hours * 60 + 60;
        const expected = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
        await L.sendMail(process.env.SAFETY_EMAIL, b.phase === "arrived" ? `📍 Arrivée sur place — ${doc.id}` : `✅ Prestation terminée — ${doc.id}`, L.mailLayout(b.phase === "arrived" ? "La cheffe est arrivée" : "La cheffe a terminé",
          b.phase === "arrived"
            ? `<p>Arrivée à <b>${time}</b> :<br>${L.esc(doc.address)}, ${L.esc(doc.postcode)} ${L.esc(doc.city)}<br>Client : ${L.esc(doc.customer.name)} · ${L.esc(doc.customer.phone)}</p><p><b>Fin prévue vers ${expected}.</b> Si vous n'avez pas reçu le message « terminé » d'ici là, appelez-la.</p>`
            : `<p>Fin de prestation signalée à <b>${time}</b>. Tout va bien.</p>`));
      }
      return res.json({ ok: true, doc, notified: !!process.env.SAFETY_EMAIL });
    }

    throw new Error("Action inconnue.");
  } catch (e) {
    res.status(400).json({ error: e.message === "STRIPE_NOT_READY" ? "Stripe n'est pas encore configuré." : e.message });
  }
};
