/* Montabo Soleil — shop page (click & collect, events, private chef). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euro = (c) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const C = window.CONFIG, M = window.MENU;
  const ITEM = new Map(M.items.map((i) => [i.id, i]));
  const TRAY = new Map((M.catering || []).map((i) => [i.id, i]));
  const ALLERGENS = { gluten: "Gluten", crustaces: "Crustacés", oeufs: "Œufs", poissons: "Poissons", arachides: "Arachides", soja: "Soja", lait: "Lait", "fruits-a-coque": "Fruits à coque", celeri: "Céleri", moutarde: "Moutarde", sesame: "Sésame", sulfites: "Sulfites", lupin: "Lupin", mollusques: "Mollusques" };
  const TAGS = { signature: ["⭐ Signature", "sun"], nouveau: ["Nouveau", "hot"], vegetarien: ["Végétarien", "leaf"], vegan: ["Vegan", "leaf"], "sans-gluten": ["Sans gluten", "leaf"], epice: ["🌶️ Relevé", "hot"] };
  const I = {
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  };

  // ---------- state ----------
  const KEY = "montabo.cart.v1";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let cart = load(KEY, []);              // [{ key, id, qty, opts, note }]
  let trays = {};                        // catering: { id: qty }
  let live = { soldOut: [], paused: false, pauseMsg: "" };
  let pickup = load("montabo.pickup", { date: "", time: "" });
  const contact = load("montabo.contact", { name: "", email: "", phone: "" });
  const saveCart = () => { store(KEY, cart); updateCartUi(); };

  // ---------- Paris time & pickup slots (the server checks the same rules) ----------
  function parisNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
  }
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dow = (d) => new Date(d + "T12:00:00Z").getUTCDay();
  const fmtDay = (d, opts) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { timeZone: "UTC", ...opts });
  function pickupDays() {
    const now = parisNow(), out = [];
    for (let i = 0; i <= C.pickup.windowDays; i++) {
      const d = addDays(now.date, i);
      if (C.pickup.days.includes(dow(d)) && slotsFor(d).some((s) => s.ok)) out.push(d);
    }
    return out;
  }
  function slotsFor(d) {
    const now = parisNow(), p = C.pickup, ahead = Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(now.date + "T12:00:00Z")) / 864e5), out = [];
    for (let t = toMin(p.open); t <= toMin(p.close) - p.slotMinutes; t += p.slotMinutes) out.push({ time: fromMin(t), ok: ahead * 1440 + t >= now.minutes + p.leadMinutes });
    return out;
  }
  const nextPickupLabel = () => { const d = pickupDays()[0]; return d ? fmtDay(d, { weekday: "long", day: "numeric", month: "long" }) : "bientôt"; };

  // ---------- cart helpers ----------
  function unitPrice(item, opts) {
    return item.price + (item.options || []).reduce((s, g) => s + ((g.choices.find((c) => c.id === (opts || {})[g.id]) || {}).price || 0), 0);
  }
  const optLabels = (item, opts) => (item.options || []).map((g) => (g.choices.find((c) => c.id === (opts || {})[g.id]) || {}).name).filter(Boolean);
  const cartTotal = () => cart.reduce((s, l) => { const it = ITEM.get(l.id); return it ? s + unitPrice(it, l.opts) * l.qty : s; }, 0);
  const cartCount = () => cart.reduce((s, l) => s + l.qty, 0);
  function updateCartUi() {
    cart = cart.filter((l) => ITEM.has(l.id));
    const n = cartCount(), badge = $("#cartCount");
    badge.hidden = !n; badge.textContent = n;
    const bar = $("#cartBar");
    const show = n && !["panier", "merci"].includes(route().name);
    bar.hidden = !show;
    if (show) bar.innerHTML = `<a href="#/panier"><span>Voir le panier · ${n} article${n > 1 ? "s" : ""}</span><span class="num">${euro(cartTotal())}</span></a>`;
  }

  // ---------- UI helpers ----------
  let toastT;
  const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2300); };
  const openSheet = (html) => { $("#sheet").innerHTML = html; $("#sheetWrap").hidden = false; document.body.style.overflow = "hidden"; };
  const closeSheet = () => { $("#sheetWrap").hidden = true; document.body.style.overflow = ""; };
  const pic = (it, cls = "pic") => `<div class="${cls}">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : it.emoji || "🍽️"}</div>`;
  const tagPills = (it) => (it.tags || []).filter((t) => TAGS[t]).map((t) => `<span class="pill ${TAGS[t][1]}">${TAGS[t][0]}</span>`).join(" ");
  const allergenText = (it) => (it.allergens || []).length ? `Allergènes : ${it.allergens.map((a) => ALLERGENS[a] || a).join(", ")}.` : "Aucun des 14 allergènes majeurs dans la recette.";
  const sampleBanner = () => (M.sample ? `<div class="banner">🧪 <b>Aperçu</b> — la carte et les prix sont des exemples en attendant ceux de la cheffe.</div>` : "");
  const footer = () => `<footer><img src="assets/mark.svg" alt="" width="36" height="36" style="margin:0 auto"><b style="color:var(--text)">${esc(C.name)}</b><span>${esc(C.market.name)} · ${esc(C.market.address)}</span><span>Retrait samedi & dimanche, ${C.pickup.open.replace(":", "h")}–${C.pickup.close.replace(":", "h")}</span><span>Prix TTC · Paiement sécurisé par Stripe · Allergènes indiqués sur chaque produit</span></footer>`;

  // ---------- routing ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [name, qs] = h.split("?");
    return { name: name || "", q: new URLSearchParams(qs || "") };
  }
  function render() {
    const r = route();
    document.querySelectorAll(".tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.route === r.name ? "page" : "false"));
    const view = { "": home, carte: menu, panier: cartView, traiteur: catering, cheffe: chef, merci: thanks }[r.name] || home;
    $("#view").innerHTML = view(r.q);
    updateCartUi();
    if (r.name === "merci") loadThanks(r.q);
  }
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); loadLive(); });

  // ---------- pages ----------
  function home() {
    return `
      <section class="hero">
        <img src="assets/mark.svg" alt="">
        <span class="eyebrow" style="color:#7a2a00">Guyane · Caraïbes · Paris</span>
        <h1>Le soleil de Montabo,<br>dans votre assiette.</h1>
        <p>${esc(C.tagline)}. Commandez en ligne, on vous le prépare pour le week-end.</p>
        <div class="row wrap"><a class="btn dark" href="#/carte">Commander</a><a class="btn" href="#/cheffe" style="background:rgba(255,255,255,.75);border-color:transparent;color:#241305">Réserver la cheffe</a></div>
      </section>
      ${live.paused ? `<div class="banner bad">⏸️ ${esc(live.pauseMsg || "Les commandes sont en pause pour le moment. Revenez vite !")}</div>` : ""}
      <div class="facts">
        <div class="fact"><b>📍 Au marché</b><span>${esc(C.market.name)}</span></div>
        <div class="fact"><b>🗓️ Sam. & dim.</b><span>${C.pickup.open.replace(":", "h")} – ${C.pickup.close.replace(":", "h")}</span></div>
        <div class="fact"><b>🛍️ Prochain retrait</b><span style="text-transform:capitalize">${esc(nextPickupLabel())}</span></div>
      </div>
      <div class="stack"><span class="eyebrow">Ce qu'on vous propose</span>
        <div class="paths">
          <a class="path" href="#/carte"><span class="em">🍛</span><div class="grow"><h3>Click & collect</h3><p>Plats, pâtés, douceurs, jus et épices à retirer au stand.</p></div>${I.right}</a>
          <a class="path" href="#/traiteur"><span class="em">🎉</span><div class="grow"><h3>Pour vos événements</h3><p>Plateaux et buffets à commander en quantité.</p></div>${I.right}</a>
          <a class="path" href="#/cheffe"><span class="em">👩🏾‍🍳</span><div class="grow"><h3>Cheffe à domicile</h3><p>Un repas guyanais cuisiné chez vous pour vos invités.</p></div>${I.right}</a>
        </div></div>
      <section class="card stack"><span class="eyebrow">Nos coups de cœur</span>
        <div class="items">${M.items.filter((i) => (i.tags || []).includes("signature")).slice(0, 4).map(itemCard).join("")}</div>
        <a class="btn block" href="#/carte">Voir toute la carte</a></section>
      <section class="card stack"><span class="eyebrow">Notre histoire</span><h2>De Cayenne à Paris</h2>
        <p class="muted">Montabo, c'est la plage de Cayenne où l'on mange en famille face à l'Atlantique. Notre cheffe y a appris le bouillon d'awara, le colombo et les pâtés créoles. Elle les cuisine aujourd'hui pour Paris, avec les épices de là-bas.</p></section>
      ${footer()}`;
  }

  function itemCard(it) {
    const out = live.soldOut.includes(it.id);
    return `<button class="item ${out ? "out" : ""}" data-act="item" data-id="${it.id}" ${out ? 'aria-disabled="true"' : ""}>
      ${pic(it)}<div class="grow"><h3>${esc(it.name)}</h3><p class="desc">${esc(it.desc)}</p>
      <div class="row wrap" style="gap:6px"><span class="price num">${euro(it.price)}</span>${it.unit ? `<span class="tiny muted">${esc(it.unit)}</span>` : ""}${out ? `<span class="pill">Épuisé</span>` : tagPills(it)}</div></div>
      ${out ? "" : `<span class="add">${I.plus}</span>`}</button>`;
  }

  function menu() {
    return `${sampleBanner()}
      <div class="stack"><span class="eyebrow">Click & collect · retrait le week-end</span><h1>La carte</h1></div>
      <div class="cats">${M.categories.map((c) => `<button class="chip" data-act="jump" data-v="${c.id}">${esc(c.name)}</button>`).join("")}</div>
      ${M.categories.map((c) => `<section class="stack" id="cat-${c.id}"><div class="cat-head"><h2>${esc(c.name)}</h2><p class="muted small">${esc(c.blurb || "")}</p></div>
        <div class="items">${M.items.filter((i) => i.cat === c.id).map(itemCard).join("")}</div></section>`).join("")}
      <p class="tiny muted">Tous nos plats sont préparés dans une cuisine qui manipule les 14 allergènes. Une question ? Demandez-nous au stand.</p>
      ${footer()}`;
  }

  let sheetItem = null;
  function itemSheet(it) {
    sheetItem = { it, qty: 1, opts: Object.fromEntries((it.options || []).map((g) => [g.id, g.required ? g.choices[0].id : ""])), note: "" };
    drawItemSheet();
  }
  function drawItemSheet() {
    const { it, qty, opts } = sheetItem;
    openSheet(`<div class="pic-lg">${it.img ? `<img src="${esc(it.img)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : it.emoji || "🍽️"}<button class="icon-btn close" data-close aria-label="Fermer">${I.close}</button></div>
      <div class="body">
        <div class="stack" style="gap:6px"><h2>${esc(it.name)}</h2><div class="row wrap" style="gap:6px">${tagPills(it)}${it.unit ? `<span class="pill">${esc(it.unit)}</span>` : ""}</div><p class="muted">${esc(it.desc)}</p></div>
        ${(it.options || []).map((g) => `<fieldset class="opt-group"><legend>${esc(g.name)}${g.required ? "" : ` <span class="muted small">(facultatif)</span>`}</legend>
          ${g.required ? "" : `<label class="opt"><input type="radio" name="g-${g.id}" value="" data-opt="${g.id}" ${!opts[g.id] ? "checked" : ""}><span class="grow">Sans</span></label>`}
          ${g.choices.map((c) => `<label class="opt"><input type="radio" name="g-${g.id}" value="${c.id}" data-opt="${g.id}" ${opts[g.id] === c.id ? "checked" : ""}><span class="grow">${esc(c.name)}</span>${c.price ? `<span class="small muted num">+${euro(c.price)}</span>` : ""}</label>`).join("")}</fieldset>`).join("")}
        <label class="field">Une précision ? <span class="hint">Ex. : sans oignon, sauce à part…</span><input class="input" id="itemNote" maxlength="140"></label>
        <p class="allergens">⚠️ ${allergenText(it)}</p>
        <div class="row between"><div class="stepper"><button data-act="iqty" data-v="-1" aria-label="Moins">${I.minus}</button><b id="iqty">${qty}</b><button data-act="iqty" data-v="1" aria-label="Plus">${I.plus}</button></div>
          <button class="btn primary grow" data-act="add" id="addBtn">Ajouter · <span class="num">${euro(unitPrice(it, opts) * qty)}</span></button></div>
      </div>`);
  }
  function addToCart() {
    const { it, qty, opts } = sheetItem;
    const note = ($("#itemNote").value || "").trim();
    const key = it.id + JSON.stringify(opts) + note;
    const ex = cart.find((l) => l.key === key);
    if (ex) ex.qty = Math.min(50, ex.qty + qty); else cart.push({ key, id: it.id, qty, opts, note });
    saveCart(); closeSheet(); toast(`${it.name} ajouté 🌞`);
  }

  function cartView() {
    if (!cart.length) return `<div class="stack" style="text-align:center;padding:40px 0"><div style="font-size:54px">🧺</div><h2>Votre panier est vide</h2><p class="muted">Faites un tour sur la carte, il y a du colombo qui vous attend.</p><a class="btn primary" href="#/carte" style="align-self:center">Voir la carte</a></div>`;
    const days = pickupDays();
    if (!days.includes(pickup.date)) pickup = { date: days[0] || "", time: "" };
    const slots = pickup.date ? slotsFor(pickup.date) : [];
    if (pickup.time && !slots.some((s) => s.ok && s.time === pickup.time)) pickup.time = "";
    const total = cartTotal();
    return `${sampleBanner()}
      <div class="stack"><span class="eyebrow">Click & collect</span><h1>Votre panier</h1></div>
      <section class="card" style="padding:4px 18px">${cart.map((l, idx) => {
        const it = ITEM.get(l.id), ol = optLabels(it, l.opts);
        return `<div class="line"><span class="em">${it.emoji || "🍽️"}</span><div class="grow"><b>${esc(it.name)}</b>${ol.length ? `<div class="tiny muted">${esc(ol.join(" · "))}</div>` : ""}${l.note ? `<div class="tiny muted">« ${esc(l.note)} »</div>` : ""}<div class="small num">${euro(unitPrice(it, l.opts) * l.qty)}</div></div>
          <div class="stepper"><button data-act="cqty" data-i="${idx}" data-v="-1" aria-label="Moins">${I.minus}</button><b>${l.qty}</b><button data-act="cqty" data-i="${idx}" data-v="1" aria-label="Plus">${I.plus}</button></div></div>`;
      }).join("")}</section>
      <section class="card stack"><h3>Quand passez-vous ?</h3>
        <p class="small muted">Retrait au stand : <b>${esc(C.market.name)}</b>, ${esc(C.market.address)}</p>
        ${days.length ? `<div class="days">${days.map((d) => `<button class="day" data-act="pday" data-v="${d}" aria-pressed="${pickup.date === d}"><span>${fmtDay(d, { weekday: "short" })}</span><b>${fmtDay(d, { day: "numeric" })}</b><span>${fmtDay(d, { month: "short" })}</span></button>`).join("")}</div>
          <div class="slots">${slots.map((s) => `<button class="slot" data-act="ptime" data-v="${s.time}" ${s.ok ? "" : "disabled"} aria-pressed="${pickup.time === s.time}">${s.time.replace(":", "h")}</button>`).join("")}</div>` : `<p class="muted">Aucun créneau disponible pour le moment.</p>`}
      </section>
      <section class="card stack"><h3>Vos coordonnées</h3>
        <label class="field">Nom<input class="input" id="cName" autocomplete="name" value="${esc(contact.name)}"></label>
        <div class="grid2"><label class="field">Téléphone<input class="input" id="cPhone" type="tel" autocomplete="tel" value="${esc(contact.phone)}"></label>
        <label class="field">E-mail<input class="input" id="cEmail" type="email" autocomplete="email" value="${esc(contact.email)}"></label></div>
        <label class="field">Un mot pour la cheffe ? <span class="hint">Facultatif</span><input class="input" id="cNote" maxlength="300"></label>
      </section>
      ${live.paused ? `<div class="banner bad">⏸️ ${esc(live.pauseMsg || "Les commandes sont en pause pour le moment.")}</div>` : ""}
      <div class="total"><span>Total</span><span class="num">${euro(total)}</span></div>
      <button class="btn primary block" data-act="pay" ${live.paused ? "disabled" : ""}>Payer ${euro(total)} par carte</button>
      <p class="tiny muted" style="text-align:center">Paiement sécurisé par Stripe (carte, Apple Pay, Google Pay). Vous recevez la confirmation par e-mail.</p>`;
  }

  async function pay(btn) {
    const name = $("#cName").value.trim(), email = $("#cEmail").value.trim(), phone = $("#cPhone").value.trim();
    Object.assign(contact, { name, email, phone }); store("montabo.contact", contact);
    if (!pickup.date || !pickup.time) return toast("Choisissez un jour et une heure de retrait");
    if (name.length < 2 || !/@/.test(email) || phone.replace(/\D/g, "").length < 9) return toast("Complétez votre nom, téléphone et e-mail");
    btn.disabled = true; btn.textContent = "Un instant…";
    const res = await post("/api/order", { lines: cart.map(({ id, qty, opts, note }) => ({ id, qty, opts, note })), date: pickup.date, time: pickup.time, name, email, phone, note: $("#cNote").value });
    if (res.demo) { const id = "MS-DEMO1"; store("montabo.last", { id, pickup, lines: cart, total: cartTotal() }); cart = []; saveCart(); location.hash = `#/merci?id=${id}&demo=1`; return; }
    if (res.url) { store("montabo.pending", { id: res.id }); location.href = res.url; return; }
    btn.disabled = false; btn.textContent = `Payer ${euro(cartTotal())} par carte`; toast(res.error || "Une erreur est survenue");
  }

  async function post(url, body) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const type = r.headers.get("content-type") || "";
      if (!type.includes("json")) return { demo: true };   // static preview with no server behind it
      const data = await r.json();
      return r.ok ? data : { error: data.error };
    } catch { return { demo: true }; }
  }

  function catering() {
    const P = C.catering, min = addDays(parisNow().date, P.noticeDays);
    const est = Object.entries(trays).reduce((s, [id, q]) => s + (TRAY.get(id)?.price || 0) * q, 0);
    return `${sampleBanner()}
      <div class="stack"><span class="eyebrow">Anniversaires · bureaux · mariages</span><h1>Pour vos événements</h1>
        <p class="muted">Choisissez vos plateaux, indiquez la date. La cheffe confirme sous 48 h et vous envoie le lien de paiement. Commande au moins ${P.noticeDays} jours à l'avance.</p></div>
      <section class="stack">${(M.catering || []).map((t) => {
        const q = trays[t.id] || 0;
        return `<div class="item" style="cursor:default">${pic(t)}<div class="grow"><h3>${esc(t.name)}</h3><p class="desc">${esc(t.desc)}</p>
          <div class="row wrap" style="gap:6px"><span class="price num">${euro(t.price)}</span><span class="tiny muted">${esc(t.unit || "")}</span>${t.serves ? `<span class="pill sun">${esc(t.serves)}</span>` : ""}</div>
          <div class="row between" style="margin-top:8px"><span class="tiny muted">${t.min > 1 ? `Minimum ${t.min}` : ""}</span>
          <div class="stepper"><button data-act="tqty" data-id="${t.id}" data-v="-1" aria-label="Moins">${I.minus}</button><b>${q}</b><button data-act="tqty" data-id="${t.id}" data-v="1" aria-label="Plus">${I.plus}</button></div></div></div></div>`;
      }).join("")}</section>
      <form class="card stack" id="cateringForm" novalidate>
        <h3>Votre événement</h3>
        <div class="grid2"><label class="field">Date<input class="input" type="date" name="date" min="${min}" required></label><label class="field">Heure de retrait<input class="input" type="time" name="time" step="900"></label></div>
        <div class="grid2"><label class="field">Nombre de personnes<input class="input" type="number" name="guests" min="1" inputmode="numeric"></label>
          <label class="field">Occasion<select class="input" name="event">${C.privateChef.events.map((e) => `<option>${e}</option>`).join("")}</select></label></div>
        <label class="field">Nom<input class="input" name="name" autocomplete="name" value="${esc(contact.name)}" required></label>
        <div class="grid2"><label class="field">Téléphone<input class="input" name="phone" type="tel" autocomplete="tel" value="${esc(contact.phone)}" required></label><label class="field">E-mail<input class="input" name="email" type="email" autocomplete="email" value="${esc(contact.email)}" required></label></div>
        <label class="field">Précisions <span class="hint">Allergies, lieu de retrait souhaité, livraison possible ?…</span><textarea class="input" name="note" maxlength="1000"></textarea></label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="total"><span>Estimation</span><span class="num" id="trayTotal">${euro(est)}</span></div>
        <button class="btn primary block" type="submit">Envoyer la demande</button>
        <p class="tiny muted" style="text-align:center">Rien n'est débité maintenant.</p>
      </form>${footer()}`;
  }

  function chef() {
    const P = C.privateChef, min = addDays(parisNow().date, P.noticeDays);
    const shield = (t, d) => `<div class="shield"><span class="ic">${I.shield}</span><div><b>${t}</b><p class="small muted">${d}</p></div></div>`;
    return `
      <div class="stack"><span class="eyebrow">Sur demande · Île-de-France</span><h1>La cheffe chez vous</h1>
        <p class="muted">Un vrai repas guyanais cuisiné sur place pour ${P.minGuests} à ${P.maxGuests} invités : colombo, blaff, accras, douceurs coco… On construit le menu ensemble.</p></div>
      <section class="card stack"><h3>Comment ça marche</h3>
        <ul class="steps">
          <li><div><b>Vous envoyez une demande</b><p class="small muted">Date, lieu, nombre d'invités, envies. C'est gratuit et sans engagement.</p></div></li>
          <li><div><b>La cheffe vous appelle</b><p class="small muted">Pour faire connaissance, caler le menu et vous donner un prix.</p></div></li>
          <li><div><b>Vous confirmez avec un acompte</b><p class="small muted">${P.depositPercent} % par carte via un lien sécurisé. Le solde est réglé le jour J.</p></div></li>
        </ul></section>
      <section class="card stack"><h3>Notre charte de confiance</h3>
        ${shield("Chaque demande est vérifiée", "La cheffe accepte uniquement après un échange téléphonique. Elle peut refuser sans justification.")}
        ${shield("Des lieux adaptés", "Domicile avec l'hôte présent, salle louée, entreprise ou association, en Île-de-France uniquement.")}
        ${shield("Identité confirmée par le paiement", "L'acompte par carte relie la réservation à une personne réelle.")}
        ${shield("Jamais seule sans que l'on sache où", "Un proche de confiance reçoit l'adresse et l'horaire de chaque prestation, et un message d'arrivée et de fin.")}
      </section>
      <form class="card stack" id="chefForm" novalidate>
        <h3>Votre demande</h3>
        <div class="grid2"><label class="field">Date<input class="input" type="date" name="date" min="${min}" required></label><label class="field">Heure du service<input class="input" type="time" name="time" value="19:30" step="900" required></label></div>
        <div class="grid2"><label class="field">Invités<input class="input" type="number" name="guests" min="${P.minGuests}" max="${P.maxGuests}" inputmode="numeric" required></label>
          <label class="field">Durée sur place<select class="input" name="hours">${[3, 4, 5, 6, 8].map((h) => `<option value="${h}" ${h === 4 ? "selected" : ""}>${h} h</option>`).join("")}</select></label></div>
        <label class="field">Occasion<select class="input" name="event">${P.events.map((e) => `<option>${e}</option>`).join("")}</select></label>
        <label class="field">Type de lieu<select class="input" name="venue" required><option value="">Choisir…</option>${P.venues.map((v) => `<option value="${v.id}">${esc(v.label)}</option>`).join("")}</select></label>
        <label class="field">Adresse du lieu<input class="input" name="address" autocomplete="street-address" required></label>
        <div class="grid2"><label class="field">Code postal<input class="input" name="postcode" inputmode="numeric" maxlength="5" autocomplete="postal-code" required></label><label class="field">Ville<input class="input" name="city" autocomplete="address-level2" required></label></div>
        <label class="field">Société / association <span class="hint">Si c'est pour une structure</span><input class="input" name="company"></label>
        <label class="check"><input type="checkbox" name="kitchen" checked> Une cuisine équipée (plaques, four) est disponible sur place</label>
        <label class="field">Vos envies <span class="hint">Plats préférés, ambiance, buffet ou service à table…</span><textarea class="input" name="wishes" maxlength="1000"></textarea></label>
        <label class="field">Allergies et régimes<input class="input" name="diet" maxlength="400" placeholder="Ex. : 2 végétariens, 1 allergie aux arachides"></label>
        <label class="field">Budget indicatif <span class="hint">Facultatif</span><input class="input" name="budget" placeholder="Ex. : 40 € / personne"></label>
        <label class="field">Votre nom complet<input class="input" name="name" autocomplete="name" value="${esc(contact.name)}" required></label>
        <div class="grid2"><label class="field">Téléphone<input class="input" name="phone" type="tel" autocomplete="tel" value="${esc(contact.phone)}" required></label><label class="field">E-mail<input class="input" name="email" type="email" autocomplete="email" value="${esc(contact.email)}" required></label></div>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="check"><input type="checkbox" name="hostPresent"> Je serai présent·e (ou un adulte responsable) pendant toute la prestation</label>
        <label class="check"><input type="checkbox" name="adult"> J'ai plus de 18 ans</label>
        <label class="check"><input type="checkbox" name="terms"> J'accepte que la cheffe puisse refuser ou écourter une prestation si elle ne se sent pas en sécurité, l'acompte restant alors acquis</label>
        <button class="btn primary block" type="submit">Envoyer ma demande</button>
        <p class="tiny muted" style="text-align:center">Gratuit et sans engagement · réponse sous 48 h</p>
      </form>${footer()}`;
  }

  async function submitRequest(form, type) {
    const fd = new FormData(form), body = { type };
    for (const [k, v] of fd.entries()) body[k] = v;
    ["kitchen", "hostPresent", "adult", "terms"].forEach((k) => (body[k] = fd.has(k)));
    if (type === "traiteur") {
      body.lines = Object.entries(trays).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty }));
      if (!body.lines.length) return toast("Ajoutez au moins un plateau");
    }
    const need = type === "chef" ? ["date", "time", "guests", "venue", "address", "postcode", "city", "name", "phone", "email"] : ["date", "name", "phone", "email"];
    const missing = need.find((k) => !String(body[k] || "").trim());
    if (missing) { form.querySelector(`[name="${missing}"]`)?.focus(); return toast("Complétez les champs obligatoires"); }
    if (type === "chef" && !(body.hostPresent && body.adult && body.terms)) return toast("Merci de cocher les trois engagements");
    Object.assign(contact, { name: body.name, email: body.email, phone: body.phone }); store("montabo.contact", contact);
    const btn = form.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Envoi…";
    const res = await post("/api/request", body);
    btn.disabled = false; btn.textContent = type === "chef" ? "Envoyer ma demande" : "Envoyer la demande";
    if (res.error) return toast(res.error);
    if (type === "traiteur") trays = {};
    location.hash = `#/merci?req=${res.id || (type === "chef" ? "CP-DEMO1" : "TR-DEMO1")}${res.demo ? "&demo=1" : ""}`;
  }

  function thanks(q) {
    const demo = q.get("demo") ? `<div class="banner">🧪 Aperçu : rien n'a été envoyé ni débité. Une fois le site en ligne, ce bouton enverra vraiment la commande.</div>` : "";
    if (q.get("req")) {
      const isChef = q.get("req").startsWith("CP");
      return `<div class="big-check">${I.check}</div><div class="stack" style="text-align:center"><h1>Demande envoyée !</h1>
        <p class="muted">Référence <b>${esc(q.get("req"))}</b>. ${isChef ? "La cheffe vous appelle sous 48 h pour en parler." : "La cheffe vous répond sous 48 h avec le prix final et un lien de paiement."} Un e-mail récapitulatif est en route.</p></div>${demo}<a class="btn" href="#/" style="align-self:center">Retour à l'accueil</a>`;
    }
    return `<div class="big-check">${I.check}</div><div class="stack" style="text-align:center"><h1>Merci, c'est commandé !</h1><p class="muted">Commande <b>${esc(q.get("id") || "")}</b></p></div>${demo}<section class="card stack" id="orderBox"><p class="muted">Chargement…</p></section><a class="btn" href="#/carte" style="align-self:center">Retour à la carte</a>`;
  }
  async function loadThanks(q) {
    const box = $("#orderBox"); if (!box) return;
    let o = null;
    if (q.get("demo")) { const l = load("montabo.last", null); if (l) o = { ...l, status: "paid", lines: l.lines.map((x) => ({ ...x, name: ITEM.get(x.id)?.name, opts: optLabels(ITEM.get(x.id), x.opts) })) }; }
    else { cart = []; saveCart(); try { const r = await fetch(`/api/order?id=${encodeURIComponent(q.get("id"))}&t=${encodeURIComponent(q.get("t"))}`); if (r.ok) o = await r.json(); } catch {} }
    if (!o) { box.innerHTML = `<p class="muted">Votre paiement est en cours de confirmation. Vous recevrez un e-mail dans quelques instants.</p>`; return; }
    box.innerHTML = `<div class="row between"><b>Retrait</b><span style="text-transform:capitalize">${fmtDay(o.pickup.date, { weekday: "long", day: "numeric", month: "long" })} · ${o.pickup.time.replace(":", "h")}</span></div>
      <p class="small muted">${esc(C.market.name)} — ${esc(C.market.address)}</p>
      <div>${o.lines.map((l) => `<div class="row between small" style="padding:4px 0"><span>${l.qty} × ${esc(l.name)}${l.opts && l.opts.length ? ` <span class="muted">(${esc(l.opts.join(", "))})</span>` : ""}</span></div>`).join("")}</div>
      <div class="total"><span>Total</span><span class="num">${euro(o.total)}</span></div>
      <p class="small">Présentez votre numéro de commande au stand. On vous envoie un e-mail quand c'est prêt ☀️</p>`;
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const el = e.target.closest("[data-act]"); if (!el) return;
    const v = el.dataset.v;
    switch (el.dataset.act) {
      case "item": { const it = ITEM.get(el.dataset.id); if (!it) return; if (live.soldOut.includes(it.id)) return toast("Épuisé pour ce week-end"); if (live.paused) return toast(live.pauseMsg || "Les commandes sont en pause"); return itemSheet(it); }
      case "jump": { document.querySelectorAll(".cats .chip").forEach((c) => c.setAttribute("aria-pressed", c === el)); $(`#cat-${v}`)?.scrollIntoView({ behavior: "smooth" }); return; }
      case "iqty": sheetItem.qty = Math.max(1, Math.min(50, sheetItem.qty + Number(v))); $("#iqty").textContent = sheetItem.qty; $("#addBtn span").textContent = euro(unitPrice(sheetItem.it, sheetItem.opts) * sheetItem.qty); return;
      case "add": return addToCart();
      case "cqty": { const l = cart[Number(el.dataset.i)]; l.qty += Number(v); if (l.qty <= 0) cart.splice(Number(el.dataset.i), 1); saveCart(); return render(); }
      case "pday": pickup = { date: v, time: "" }; store("montabo.pickup", pickup); return render();
      case "ptime": pickup.time = v; store("montabo.pickup", pickup); document.querySelectorAll(".slot").forEach((s) => s.setAttribute("aria-pressed", s === el)); return;
      case "pay": return pay(el);
      case "tqty": {
        const t = TRAY.get(el.dataset.id), cur = trays[t.id] || 0, min = t.min || 1;
        let n = cur + Number(v); if (Number(v) > 0 && cur === 0) n = min; if (n < min) n = 0;
        trays[t.id] = Math.min(200, n);
        el.parentElement.querySelector("b").textContent = trays[t.id];
        $("#trayTotal").textContent = euro(Object.entries(trays).reduce((s, [id, q]) => s + TRAY.get(id).price * q, 0));
        return;
      }
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset.opt && sheetItem) { sheetItem.opts[e.target.dataset.opt] = e.target.value; $("#addBtn span").textContent = euro(unitPrice(sheetItem.it, sheetItem.opts) * sheetItem.qty); }
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "chefForm") submitRequest(e.target, "chef");
    if (e.target.id === "cateringForm") submitRequest(e.target, "traiteur");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // Sold-out items and the pause switch can change during the day: re-check when the page changes.
  let liveAt = 0;
  function loadLive() {
    if (Date.now() - liveAt < 5000) return;
    liveAt = Date.now();
    fetch("/api/shop").then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null)).then((d) => {
      if (d && JSON.stringify(d) !== JSON.stringify(live)) { live = d; render(); }
    }).catch(() => {});
  }
  render();
  loadLive();
})();
