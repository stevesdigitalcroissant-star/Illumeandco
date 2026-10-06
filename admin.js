/* Espace cheffe: orders by pickup day with a prep list, booking/catering requests, sold-out switches. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euro = (c) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const fmtDay = (d, o = { weekday: "long", day: "numeric", month: "long" }) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { timeZone: "UTC", ...o });
  const C = window.CONFIG, M = window.MENU;
  const LABEL = { awaiting_payment: "Paiement en cours", paid: "Nouvelle", preparing: "En préparation", ready: "Prête", collected: "Récupérée", cancelled: "Annulée", pending: "À répondre", accepted: "Lien de paiement envoyé", confirmed: "Confirmée", declined: "Refusée" };
  const NEXT = { paid: ["preparing", "Commencer"], preparing: ["ready", "Prête ✓"], ready: ["collected", "Récupérée ✓"] };

  let data = null, day = null, seen = new Set(JSON.parse(localStorage.getItem("ms.seen") || "[]"));
  let toastT;
  const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2500); };

  async function api(body) {
    const r = await fetch("/api/admin", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: "Serveur injoignable." }));
    if (r.status === 401 && j.error === "login") { data = null; renderLogin(); throw new Error("login"); }
    if (!r.ok) throw new Error(j.error || "Erreur");
    return j;
  }
  async function refresh(quiet) {
    try {
      const fresh = await api();
      const newOnes = fresh.orders.filter((o) => o.status === "paid" && !seen.has(o.id)).length + fresh.requests.filter((r) => r.status === "pending" && !seen.has(r.id)).length;
      if (quiet && data && newOnes) { toast(`🛎️ ${newOnes} nouveauté${newOnes > 1 ? "s" : ""} !`); navigator.vibrate?.([120, 60, 120]); }
      document.title = newOnes ? `(${newOnes}) Espace cheffe` : "Espace cheffe";
      data = fresh; render();
    } catch (e) { if (e.message !== "login" && !quiet) { if (!data) renderLogin(); toast(e.message); } }
  }

  function renderLogin() {
    $("#tabs").hidden = true; $("#logout").hidden = true;
    $("#view").innerHTML = `<form class="card stack" id="login" style="margin-top:30px"><h1>Bonjour cheffe ☀️</h1><p class="muted">Connectez-vous pour voir les commandes et les demandes.</p>
      <label class="field">Mot de passe<input class="input" type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn primary block">Se connecter</button></form>`;
  }

  const route = () => location.hash.slice(1) || "commandes";
  function render() {
    if (!data) return;
    $("#tabs").hidden = false; $("#logout").hidden = false;
    document.querySelectorAll("#tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.route === route() ? "page" : "false"));
    const pend = data.requests.filter((r) => r.status === "pending").length;
    $('#tabs a[data-route="demandes"]').textContent = pend ? `Demandes (${pend})` : "Demandes";
    $("#view").innerHTML = setupBanner() + ({ commandes: orders, demandes: requests, carte: settings }[route()] || orders)();
  }

  function setupBanner() {
    const s = data.setup, missing = [];
    if (!s.store) missing.push("Connecter un <b>Blob store privé</b> (Vercel → Storage)");
    if (!s.stripe) missing.push("Ajouter <b>STRIPE_SECRET_KEY</b>");
    if (!s.webhook) missing.push("Ajouter <b>STRIPE_WEBHOOK_SECRET</b> (webhook vers /api/stripe-webhook)");
    if (!s.mail) missing.push("Ajouter <b>RESEND_API_KEY</b> pour envoyer les e-mails");
    if (!s.orderEmail) missing.push("Ajouter <b>ORDER_EMAIL</b> (votre adresse)");
    if (!s.safety) missing.push("Recommandé : <b>SAFETY_EMAIL</b> (un proche prévenu de chaque prestation à domicile)");
    return missing.length ? `<div class="banner"><b>À finir de configurer :</b><ul class="setup" style="margin:6px 0 0;padding-left:18px">${missing.map((m) => `<li>${m}</li>`).join("")}</ul></div>` : "";
  }

  // ---------- orders ----------
  function orders() {
    const live = data.orders;
    const days = [...new Set(live.filter((o) => o.pickup.date >= data.today).map((o) => o.pickup.date))].sort();
    if (!day || (!days.includes(day) && day >= data.today)) day = days[0] || data.today;
    const list = live.filter((o) => o.pickup.date === day).sort((a, b) => a.pickup.time.localeCompare(b.pickup.time));
    const active = list.filter((o) => !["awaiting_payment", "cancelled"].includes(o.status));
    const prep = new Map();
    active.forEach((o) => o.lines.forEach((l) => { const k = l.name + (l.opts.length ? ` (${l.opts.join(", ")})` : ""); prep.set(k, (prep.get(k) || 0) + l.qty); }));
    const revenue = active.reduce((s, o) => s + o.total, 0);
    const pastDays = [...new Set(live.filter((o) => o.pickup.date < data.today).map((o) => o.pickup.date))].sort().reverse().slice(0, 6);
    return `
      <div class="days" style="margin:0 -16px;padding:2px 16px">${[...days, ...pastDays.filter((d) => !days.includes(d))].map((d) => {
        const n = live.filter((o) => o.pickup.date === d && !["awaiting_payment", "cancelled"].includes(o.status)).length;
        return `<button class="day" data-act="day" data-v="${d}" aria-pressed="${d === day}" ${d < data.today ? 'style="opacity:.6"' : ""}><span>${fmtDay(d, { weekday: "short" })}</span><b>${fmtDay(d, { day: "numeric" })}</b><span>${n} cde${n > 1 ? "s" : ""}</span></button>`;
      }).join("") || `<p class="muted">Aucune commande à venir pour l'instant.</p>`}</div>
      <section class="card stack"><div class="row between"><h3 style="text-transform:capitalize">${esc(fmtDay(day))}</h3><span class="muted small num">${active.length} commande${active.length > 1 ? "s" : ""} · ${euro(revenue)}</span></div>
        ${prep.size ? `<div class="stack" style="gap:6px"><span class="eyebrow">À préparer</span><div class="prep">${[...prep.entries()].sort((a, b) => b[1] - a[1]).map(([k, q]) => `<b>${q} ×</b><span>${esc(k)}</span>`).join("")}</div></div>` : `<p class="muted small">Rien à préparer ce jour-là.</p>`}
        <button class="btn small" data-act="print" style="align-self:flex-start">Imprimer la liste</button></section>
      ${list.map(orderCard).join("")}`;
  }
  function orderCard(o) {
    const next = NEXT[o.status];
    seen.add(o.id);
    return `<section class="card order ${["awaiting_payment", "cancelled", "collected"].includes(o.status) ? "dim" : ""}">
      <div class="row between"><div><b style="font-size:17px">${o.pickup.time.replace(":", "h")} · ${esc(o.customer.name)}</b><div class="tiny muted">${o.id}</div></div><span class="status ${o.status}">${LABEL[o.status]}</span></div>
      <div class="small">${o.lines.map((l) => `<div><b>${l.qty} ×</b> ${esc(l.name)}${l.opts.length ? ` <span class="muted">(${esc(l.opts.join(", "))})</span>` : ""}${l.note ? ` <i class="muted">« ${esc(l.note)} »</i>` : ""}</div>`).join("")}</div>
      ${o.note ? `<div class="banner">« ${esc(o.note)} »</div>` : ""}
      <div class="row between wrap"><span class="num"><b>${euro(o.total)}</b></span>
        <div class="row"><a class="btn small" href="tel:${esc(o.customer.phone)}">Appeler</a>
        ${next ? `<button class="btn small primary" data-act="status" data-id="${o.id}" data-v="${next[0]}">${next[1]}</button>` : ""}</div></div>
    </section>`;
  }

  // ---------- requests ----------
  function requests() {
    const order = { pending: 0, accepted: 1, confirmed: 2, declined: 3 };
    const list = [...data.requests].sort((a, b) => (order[a.status] - order[b.status]) || a.date.localeCompare(b.date));
    if (!list.length) return `<div class="stack" style="text-align:center;padding:30px 0"><div style="font-size:48px">📭</div><p class="muted">Pas encore de demande de prestation ni de commande traiteur.</p></div>`;
    const repeat = (r) => data.requests.filter((x) => x.customer.email === r.customer.email && x.status === "confirmed" && x.id !== r.id).length + data.orders.filter((x) => x.customer.email === r.customer.email && ["paid", "preparing", "ready", "collected"].includes(x.status)).length;
    return list.map((r) => {
      seen.add(r.id);
      const isChef = r.kind === "chef", known = repeat(r), isToday = r.date === data.today;
      return `<section class="card stack ${r.status === "declined" ? "dim" : ""}">
        <div class="row between"><div><span class="eyebrow">${isChef ? "👩🏾‍🍳 Cheffe à domicile" : "🍱 Traiteur"}</span><h3 style="margin-top:4px;text-transform:capitalize">${esc(fmtDay(r.date))}${r.time ? ` · ${esc(r.time)}` : ""}</h3></div><span class="status ${r.status}">${LABEL[r.status]}</span></div>
        <div class="kv">
          <span>Client</span><span><b>${esc(r.customer.name)}</b>${known ? ` <span class="pill leaf">✓ déjà client (${known})</span>` : ` <span class="pill">nouveau</span>`}</span>
          <span>Contact</span><span><a href="tel:${esc(r.customer.phone)}">${esc(r.customer.phone)}</a> · <a href="mailto:${esc(r.customer.email)}">${esc(r.customer.email)}</a></span>
          ${isChef ? `<span>Invités</span><span>${r.guests} · ${esc(r.event)} · ${r.hours} h</span>
          <span>Lieu</span><span>${esc(r.venueLabel)}${r.company ? ` · ${esc(r.company)}` : ""}<br><a href="https://www.google.com/maps/search/${encodeURIComponent(`${r.address} ${r.postcode} ${r.city}`)}" target="_blank" rel="noopener">${esc(r.address)}, ${esc(r.postcode)} ${esc(r.city)}</a></span>
          <span>Cuisine</span><span>${r.kitchen ? "Équipée" : "⚠️ Pas de cuisine équipée"}</span>
          ${r.wishes ? `<span>Envies</span><span>${esc(r.wishes)}</span>` : ""}${r.diet ? `<span>Régimes</span><span>${esc(r.diet)}</span>` : ""}${r.budget ? `<span>Budget</span><span>${esc(r.budget)}</span>` : ""}`
          : `<span>Événement</span><span>${esc(r.event || "")}${r.guests ? ` · ${r.guests} pers.` : ""}</span>
          <span>Plateaux</span><span>${r.lines.map((l) => `${l.qty} × ${esc(l.name)}`).join("<br>")}</span>
          <span>Estimation</span><span>${euro(r.estimate)}</span>${r.note ? `<span>Note</span><span>${esc(r.note)}</span>` : ""}`}
        </div>
        ${r.status === "pending" ? `
          ${isChef ? `<div class="banner">☎️ Appelez le client avant d'accepter. Fiez-vous à votre instinct : vous pouvez refuser sans vous justifier.</div>` : ""}
          <form class="stack" data-form="accept" data-id="${r.id}">
            <label class="field">Prix total (€)${isChef ? `<span class="hint">L'acompte de ${C.privateChef.depositPercent} % sera demandé tout de suite</span>` : ""}<input class="input" name="amount" type="number" min="10" step="1" inputmode="decimal" value="${isChef ? "" : Math.round(r.estimate / 100)}" required></label>
            <label class="field">Message au client <span class="hint">Facultatif</span><textarea class="input" name="message" placeholder="Ex. : Merci pour l'appel ! Voici le menu dont on a parlé…"></textarea></label>
            <div class="row"><button class="btn" type="button" data-act="decline" data-id="${r.id}">Refuser</button><button class="btn primary grow">Accepter & envoyer le lien</button></div>
          </form>` : ""}
        ${r.status === "accepted" ? `<p class="small">Prix : <b>${euro(r.quote)}</b> · à payer maintenant : <b>${euro(r.due)}</b>. Le client a reçu le lien par e-mail.</p><button class="btn small" data-act="copy" data-v="${esc(r.payUrl)}" style="align-self:flex-start">Copier le lien de paiement</button>` : ""}
        ${r.status === "confirmed" ? `<p class="small">✅ ${euro(r.paidAmount || 0)} reçus.${isChef ? ` Solde à régler sur place : <b>${euro((r.quote || 0) - (r.paidAmount || 0))}</b>` : ""}</p>` : ""}
        ${r.status === "confirmed" && isChef && isToday ? `<div class="row wrap">${r.arrivedAt ? `<span class="pill leaf">Arrivée signalée</span>` : `<button class="btn primary" data-act="checkin" data-id="${r.id}" data-v="arrived">📍 Je suis arrivée</button>`}${r.doneAt ? `<span class="pill leaf">Terminé ✓</span>` : `<button class="btn" data-act="checkin" data-id="${r.id}" data-v="done">✅ J'ai terminé</button>`}</div><p class="tiny muted">Votre contact de confiance est prévenu à chaque étape.</p>` : ""}
      </section>`;
    }).join("");
  }

  // ---------- menu switches ----------
  function settings() {
    const s = data.settings;
    return `<section class="card stack"><h3>Pause des commandes</h3>
        <label class="switch"><span><b>Mettre les commandes en pause</b><div class="tiny muted">Vacances, stand complet, imprévu…</div></span><input type="checkbox" id="paused" ${s.paused ? "checked" : ""}></label>
        <label class="field">Message affiché aux clients<input class="input" id="pauseMsg" value="${esc(s.pauseMsg)}" placeholder="Ex. : De retour le 14 juin !"></label></section>
      <section class="card"><h3 style="margin-bottom:6px">Épuisé ce week-end</h3><p class="tiny muted" style="margin-bottom:6px">Cochez ce qui n'est plus disponible.</p>
        ${M.categories.map((c) => `<div class="eyebrow" style="margin-top:14px">${esc(c.name)}</div>${M.items.filter((i) => i.cat === c.id).map((i) => `<label class="switch"><span>${i.emoji || ""} ${esc(i.name)}</span><input type="checkbox" data-sold="${i.id}" ${s.soldOut.includes(i.id) ? "checked" : ""}></label>`).join("")}`).join("")}
      </section>
      <button class="btn primary block" data-act="save-settings">Enregistrer</button>`;
  }

  // ---------- events ----------
  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === "login") { await api({ action: "login", password: f.password.value }); return refresh(); }
      if (f.dataset.form === "accept") {
        const amount = Math.round(Number(f.amount.value) * 100);
        if (!confirm(`Accepter pour ${euro(amount)} et envoyer le lien de paiement ?`)) return;
        await api({ action: "accept", id: f.dataset.id, amount, message: f.message.value });
        toast("Accepté ! Le client a reçu le lien 🎉"); refresh();
      }
    } catch (err) { if (err.message !== "login") toast(err.message); }
  });
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const { act, id, v } = el.dataset;
    try {
      if (act === "day") { day = v; return render(); }
      if (act === "print") return window.print();
      if (act === "status") { el.disabled = true; await api({ action: "status", id, status: v }); toast(v === "ready" ? "Le client est prévenu par e-mail" : "C'est noté"); return refresh(); }
      if (act === "decline") { const msg = prompt("Un petit mot pour le client ? (facultatif)", ""); if (msg === null) return; await api({ action: "decline", id, message: msg }); toast("Demande refusée, le client est prévenu"); return refresh(); }
      if (act === "checkin") { const r = await api({ action: "checkin", id, phase: v }); toast(r.notified ? "Votre contact de confiance est prévenu" : "Noté (aucun contact de confiance configuré)"); return refresh(); }
      if (act === "copy") { await navigator.clipboard.writeText(v); return toast("Lien copié"); }
      if (act === "save-settings") {
        const soldOut = [...document.querySelectorAll("[data-sold]:checked")].map((x) => x.dataset.sold);
        await api({ action: "settings", soldOut, paused: $("#paused").checked, pauseMsg: $("#pauseMsg").value });
        toast("Enregistré"); return refresh();
      }
    } catch (err) { if (err.message !== "login") toast(err.message); }
  });
  $("#logout").addEventListener("click", async () => { await api({ action: "logout" }).catch(() => {}); data = null; renderLogin(); });
  window.addEventListener("hashchange", () => { render(); localStorage.setItem("ms.seen", JSON.stringify([...seen].slice(-500))); });
  window.addEventListener("beforeunload", () => localStorage.setItem("ms.seen", JSON.stringify([...seen].slice(-500))));

  refresh();
  setInterval(() => document.visibilityState === "visible" && data && refresh(true), 30000);
})();
