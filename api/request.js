// POST /api/request → a private-chef booking request or an event/catering order request.
// Nothing is charged here: the chef reviews it first, then accepts (the client gets a
// payment link) or declines.
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!L.rateOk(req, 6)) return res.status(429).json({ error: "Trop de demandes, réessayez plus tard." });
  if (!L.storeReady()) return res.status(503).json({ error: "Les demandes en ligne ne sont pas encore activées." });
  const C = L.CONFIG, b = req.body || {};
  try {
    if (b.website) throw new Error("Demande refusée."); // honeypot field, invisible to people
    const customer = { name: L.clean(b.name, 80), email: L.clean(b.email, 120).toLowerCase(), phone: L.clean(b.phone, 30) };
    if (customer.name.length < 2) throw new Error("Indiquez votre nom complet.");
    if (!L.validEmail(customer.email)) throw new Error("Adresse e-mail invalide.");
    if (!L.validPhone(customer.phone)) throw new Error("Un numéro de téléphone est nécessaire.");
    if (!L.isDate(b.date)) throw new Error("Choisissez une date.");
    const ahead = L.dayDiff(L.parisNow().date, b.date);
    if (ahead > 365) throw new Error("Date trop lointaine.");

    let doc;
    if (b.type === "chef") {
      const P = C.privateChef;
      if (ahead < P.noticeDays) throw new Error(`Réservez au moins ${P.noticeDays} jours à l'avance.`);
      const guests = Math.floor(Number(b.guests));
      if (!(guests >= P.minGuests && guests <= P.maxGuests)) throw new Error(`De ${P.minGuests} à ${P.maxGuests} invités.`);
      const venue = P.venues.find((v) => v.id === b.venue);
      if (!venue) throw new Error("Choisissez le type de lieu.");
      const postcode = L.clean(b.postcode, 5);
      if (!/^\d{5}$/.test(postcode) || !P.postcodes.includes(postcode.slice(0, 2))) throw new Error("La cheffe se déplace uniquement en Île-de-France.");
      const address = L.clean(b.address, 160), city = L.clean(b.city, 60);
      if (address.length < 5 || city.length < 2) throw new Error("Indiquez l'adresse complète du lieu.");
      if (!/^\d{2}:\d{2}$/.test(b.time || "")) throw new Error("Indiquez l'heure du service.");
      if (!b.hostPresent || !b.adult || !b.terms) throw new Error("Merci de cocher les engagements en bas du formulaire.");
      doc = {
        kind: "chef", id: L.code("CP"), status: "pending", created: new Date().toISOString(), customer,
        date: b.date, time: b.time, hours: Math.min(8, Math.max(2, Math.floor(Number(b.hours)) || 4)), guests,
        event: L.clean(b.event, 40), venue: venue.id, venueLabel: venue.label, address, postcode, city,
        company: L.clean(b.company, 80), kitchen: !!b.kitchen, wishes: L.clean(b.wishes, 1000), diet: L.clean(b.diet, 400), budget: L.clean(b.budget, 40),
      };
    } else if (b.type === "traiteur") {
      if (ahead < C.catering.noticeDays) throw new Error(`Les commandes traiteur se font au moins ${C.catering.noticeDays} jours à l'avance.`);
      const { lines, total } = L.priceCart(b.lines, [], L.TRAY);
      doc = {
        kind: "traiteur", id: L.code("TR"), status: "pending", created: new Date().toISOString(), customer,
        date: b.date, time: L.clean(b.time, 5), guests: Math.floor(Number(b.guests)) || null, event: L.clean(b.event, 40),
        lines, estimate: total, note: L.clean(b.note, 1000),
      };
    } else throw new Error("Type de demande inconnu.");

    await L.writeJson(`requests/${doc.id}.json`, doc);
    const isChef = doc.kind === "chef";
    const summary = isChef
      ? `<p><b>${L.esc(L.frDate(doc.date))}</b> à ${L.esc(doc.time)} · ${doc.hours} h · ${doc.guests} invités<br>${L.esc(doc.event)} · ${L.esc(doc.venueLabel)}<br>${L.esc(doc.address)}, ${L.esc(doc.postcode)} ${L.esc(doc.city)}</p>${doc.wishes ? `<p>Envies : « ${L.esc(doc.wishes)} »</p>` : ""}${doc.diet ? `<p>Régimes / allergies : « ${L.esc(doc.diet)} »</p>` : ""}`
      : `<p><b>${L.esc(L.frDate(doc.date))}</b>${doc.time ? ` vers ${L.esc(doc.time)}` : ""}${doc.guests ? ` · ${doc.guests} personnes` : ""}</p>${L.linesTable(doc.lines)}<p style="text-align:right"><b>Estimation : ${L.euro(doc.estimate)}</b></p>${doc.note ? `<p>Note : « ${L.esc(doc.note)} »</p>` : ""}`;
    await Promise.all([
      L.sendMail(customer.email, `Demande ${doc.id} bien reçue`, L.mailLayout("Merci pour votre demande !",
        `<p>Bonjour ${L.esc(customer.name)},</p><p>Votre demande <b>${doc.id}</b> est bien arrivée. ${isChef ? "La cheffe l'étudie et vous répond sous 48 h, souvent après un petit appel pour faire connaissance." : "La cheffe vérifie ses disponibilités et vous répond sous 48 h."} Rien n'est débité pour l'instant : si elle accepte, vous recevrez un lien de paiement${isChef ? ` pour l'acompte de ${C.privateChef.depositPercent} %` : ""}.</p>${summary}`)),
      L.sendMail(process.env.ORDER_EMAIL, `${isChef ? "👩‍🍳 Demande cheffe à domicile" : "🍱 Demande traiteur"} ${doc.id} — ${L.frDate(doc.date)}`, L.mailLayout(`Nouvelle demande ${doc.id}`,
        `<p><b>${L.esc(customer.name)}</b> · ${L.esc(customer.phone)} · ${L.esc(customer.email)}</p>${summary}<p>Répondez depuis votre espace : /admin</p>`)),
    ]).catch((e) => console.error("mail", e));
    res.json({ ok: true, id: doc.id });
  } catch (e) {
    res.status(400).json({ error: e.message === "STORE_NOT_READY" ? "Les demandes en ligne ne sont pas encore activées." : e.message });
  }
};
