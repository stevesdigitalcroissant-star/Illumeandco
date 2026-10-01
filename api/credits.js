// Credits, Stripe checkout and referrals.
//   GET  /api/credits                         → wallet, packs, referral link + stats, history
//   POST /api/credits { action:"buy", pack }  → { url } Stripe Checkout page
//   POST /api/credits { action:"confirm", sid } → credits the payment once Stripe says it's paid
//   POST /api/credits { action:"grant", to, credits, note }  (owner only) gift credits
// No webhook needed: a payment is confirmed when the buyer comes back, and any
// payment still pending is re-checked every time they open the studio.
const db = require("./_db");
const C = require("./_credits");

const KEY = () => String(process.env.STRIPE_SECRET_KEY || "").trim();
const origin = req => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

async function stripe(path, form) {
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method: form ? "POST" : "GET",
    headers: { Authorization: "Bearer " + KEY(), ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Stripe: " + ((j.error && j.error.message) || r.status));
  return j;
}

// Credit a paid Checkout Session to its buyer exactly once (+ the referrer's bonus).
async function settle(user, sid) {
  const s = await stripe("/checkout/sessions/" + encodeURIComponent(sid));
  if (!s.metadata || s.metadata.user !== user.name) throw new Error("This payment belongs to another account.");
  if (s.payment_status !== "paid") return { paid: false, status: s.status };
  const credits = Math.round(Number(s.metadata.credits) || 0);
  let referrer = null;
  const added = await C.withWallet(user.name, w => {
    w.pending = (w.pending || []).filter(x => x !== sid);
    if ((w.done || []).includes(sid)) return 0;
    w.done.push(sid); w.credits += credits;
    C.entry(w, "purchase", credits, `Bought ${credits.toLocaleString()} credits`);
    referrer = w.referredBy || null;
    return credits;
  });
  if (added && referrer && C.REF_PCT() > 0) {
    const bonus = Math.round(added * C.REF_PCT() / 100);
    if (bonus > 0) await C.withWallet(referrer, w => {
      w.credits += bonus; w.refEarned = (w.refEarned || 0) + bonus;
      C.entry(w, "referral", bonus, `Referral bonus — a friend bought ${added.toLocaleString()} credits`);
    }).catch(e => console.log("referral bonus failed:", e.message));
  }
  return { paid: true, added };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const user = await db.requireUser(req, res);
  if (!user) return;
  const owner = user.role === "owner";
  try {
    if (req.method === "GET") {
      const code = await C.ensureRefCode(user.name);
      let w = await C.getWallet(user.name);
      // Re-check payments that never came back from Stripe (tab closed, etc.).
      if (KEY() && (w.pending || []).length) {
        for (const sid of w.pending.slice(-5)) { try { await settle(user, sid); } catch (e) { console.log("settle pending failed:", e.message); } }
        w = await C.getWallet(user.name);
      }
      const referrals = w.refCount || 0;
      return res.status(200).json({
        enabled: C.enabled(), canBuy: !!KEY(), owner, credits: w.credits,
        packs: C.PACKS.map(p => ({ id: p.id, usd: p.usd, credits: p.credits, bonus: p.bonus || "" })),
        ref: { code, link: `${origin(req)}/generation?ref=${code}`, percent: C.REF_PCT(), earned: w.refEarned || 0, friends: referrals },
        ledger: (w.ledger || []).slice(-30).reverse(),
      });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Not allowed." });
    const { action } = req.body || {};

    if (action === "buy") {
      if (!KEY()) return res.status(503).json({ error: "Buying credits isn't switched on yet." });
      const pack = C.PACKS.find(p => p.id === (req.body || {}).pack);
      if (!pack) return res.status(400).json({ error: "Pick a credit pack." });
      const s = await stripe("/checkout/sessions", {
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(pack.usd * 100),
        "line_items[0][price_data][product_data][name]": `Illume Studio — ${pack.credits.toLocaleString()} credits`,
        "metadata[user]": user.name, "metadata[credits]": String(pack.credits), "metadata[pack]": pack.id,
        client_reference_id: db.fileKey(user.name),
        "custom_text[submit][message]": "Credits are added to your Illume Studio account right after payment. Credits never expire and are non-refundable.",
        success_url: `${origin(req)}/generation?credits=paid&sid={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin(req)}/generation?credits=cancelled`,
      });
      await C.withWallet(user.name, w => { w.pending = [...(w.pending || []), s.id].slice(-20); });
      return res.status(200).json({ url: s.url });
    }

    if (action === "confirm") {
      if (!KEY()) return res.status(503).json({ error: "Buying credits isn't switched on yet." });
      const out = await settle(user, String((req.body || {}).sid || ""));
      const w = await C.getWallet(user.name);
      return res.status(200).json({ ...out, credits: w.credits });
    }

    if (action === "grant") {
      if (!owner) return res.status(403).json({ error: "Only the studio owner can gift credits." });
      const to = db.cleanName((req.body || {}).to), n = Math.round(Number((req.body || {}).credits) || 0);
      if (!to || !n) return res.status(400).json({ error: "Who, and how many credits?" });
      if (!(await db.getUser(to))) return res.status(404).json({ error: "No account with that name." });
      const now = await C.withWallet(to, w => { w.credits = Math.max(0, w.credits + n); C.entry(w, "gift", n, (req.body || {}).note || "Gift from the studio"); return w.credits; });
      return res.status(200).json({ ok: true, credits: now });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.log("credits failed:", e.message);
    res.status(502).json({ error: e.message });
  }
};
