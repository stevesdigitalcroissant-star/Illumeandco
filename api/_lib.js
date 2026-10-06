// Shared server helpers: storage (private Vercel Blob), pricing, pickup slots,
// Stripe (plain REST calls, no SDK), email (Resend) and the chef's login cookie.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   BLOB_READ_WRITE_TOKEN   added automatically when a private Blob store is connected
//   STRIPE_SECRET_KEY       sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET   whsec_… from the webhook pointing at /api/stripe-webhook
//   RESEND_API_KEY          re_… for sending email
//   MAIL_FROM               e.g. "Montabo Soleil <commandes@votre-domaine.fr>"
//   ORDER_EMAIL             where new orders and requests are sent (the chef)
//   SAFETY_EMAIL            optional trusted contact copied on private-chef bookings
//   ADMIN_PASSWORD          the chef's password for /admin
//   ADMIN_SECRET            long random string used to sign the login cookie
const { createHmac, randomBytes, timingSafeEqual } = require("crypto");
const MENU = require("../data/menu.js");
const CONFIG = require("../data/config.js");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}
const storeReady = () => !!(blob && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID));

// ---------- storage ----------
async function readJson(pathname) {
  if (!storeReady()) return null;
  const r = await blob.get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  try { return JSON.parse(await new Response(r.stream).text()); } catch { return null; }
}
async function writeJson(pathname, value) {
  if (!storeReady()) throw new Error("STORE_NOT_READY");
  return blob.put(pathname, JSON.stringify(value), { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
}
async function listJson(prefix, limit = 300) {
  if (!storeReady()) return [];
  const out = [];
  let cursor;
  do {
    const page = await blob.list({ prefix, limit: 1000, cursor });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor && out.length < limit);
  out.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const docs = await Promise.all(out.slice(0, limit).map((b) => readJson(b.pathname)));
  return docs.filter(Boolean);
}
const getSettings = async () => Object.assign({ soldOut: [], paused: false, pauseMsg: "" }, (await readJson("settings.json")) || {});

// ---------- ids ----------
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (prefix) => prefix + "-" + Array.from(randomBytes(5), (b) => ALPHA[b % ALPHA.length]).join("");
const token = () => randomBytes(12).toString("hex");

// ---------- Paris time & slots ----------
function parisNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const dayDiff = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const dow = (date) => new Date(date + "T12:00:00Z").getUTCDay();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s + "T12:00:00Z"));

function slotError(date, time) {
  const p = CONFIG.pickup, now = parisNow();
  if (!isDate(date) || !/^\d{2}:\d{2}$/.test(time || "")) return "Choisissez un jour et une heure de retrait.";
  if (!p.days.includes(dow(date))) return "Le retrait se fait uniquement le samedi et le dimanche.";
  const d = dayDiff(now.date, date);
  if (d < 0 || d > p.windowDays) return "Cette date n'est pas disponible.";
  const t = toMin(time);
  if (t < toMin(p.open) || t > toMin(p.close) - p.slotMinutes || (t - toMin(p.open)) % p.slotMinutes) return "Ce créneau n'existe pas.";
  if (d * 1440 + t < now.minutes + p.leadMinutes) return "Ce créneau est trop proche, choisissez-en un plus tard.";
  return null;
}

// ---------- pricing (never trust prices from the browser) ----------
const ITEM = new Map(MENU.items.map((i) => [i.id, i]));
const TRAY = new Map((MENU.catering || []).map((i) => [i.id, i]));

function priceCart(lines, soldOut = [], source = ITEM) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("Votre panier est vide.");
  if (lines.length > 60) throw new Error("Panier trop grand.");
  let total = 0;
  const out = lines.map((l) => {
    const item = source.get(l && l.id);
    if (!item) throw new Error("Un article n'existe plus. Rechargez la page.");
    if (soldOut.includes(item.id)) throw new Error(`${item.name} est épuisé pour le moment.`);
    const qty = Math.floor(Number(l.qty));
    const min = item.min || 1;
    if (!(qty >= min && qty <= 200)) throw new Error(`Quantité invalide pour ${item.name}.`);
    let unit = item.price;
    const picked = [];
    for (const g of item.options || []) {
      const cid = l.opts && l.opts[g.id];
      const c = g.choices.find((x) => x.id === cid);
      if (!c) { if (g.required) throw new Error(`Choisissez « ${g.name} » pour ${item.name}.`); continue; }
      unit += c.price || 0;
      picked.push(`${g.name} : ${c.name}`);
    }
    total += unit * qty;
    return { id: item.id, name: item.name, qty, unit, opts: picked, note: String(l.note || "").slice(0, 140) };
  });
  return { lines: out, total };
}

// ---------- Stripe (REST) ----------
function formEncode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
  }
  return out.join("&");
}
async function stripe(path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_READY");
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode(params),
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || "Stripe error");
  return data;
}
// lines: [{ name, amount (cents, per unit), qty }]
function checkoutSession({ lines, email, metadata, successUrl, cancelUrl }) {
  const line_items = {};
  lines.forEach((l, i) => {
    line_items[i] = { quantity: l.qty, price_data: { currency: "eur", unit_amount: l.amount, product_data: { name: l.name.slice(0, 250) } } };
  });
  return stripe("checkout/sessions", {
    mode: "payment",
    line_items,
    customer_email: email,
    metadata,
    payment_intent_data: { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: "fr",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 23,
  });
}
function verifyStripe(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return header.split(",").filter((kv) => kv.startsWith("v1=")).some((kv) => {
    const a = Buffer.from(kv.slice(3), "hex"), b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

// ---------- email (Resend) ----------
async function sendMail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  const list = [].concat(to).filter(Boolean);
  if (!key || !list.length) { console.log("[mail skipped]", subject, "→", list.join(", ")); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || `${CONFIG.name} <onboarding@resend.dev>`, to: list, subject, html }),
  });
  if (!r.ok) console.error("[mail failed]", r.status, await r.text());
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euro = (c) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const frDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
function mailLayout(title, body) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:auto;color:#1f1a14">
    <div style="background:linear-gradient(135deg,#f6a21a,#e8590c);color:#fff;padding:18px 22px;border-radius:14px 14px 0 0"><b style="font-size:18px">${esc(CONFIG.name)}</b></div>
    <div style="border:1px solid #eadfcc;border-top:0;padding:22px;border-radius:0 0 14px 14px"><h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>${body}</div></div>`;
}
const linesTable = (lines) => `<table style="width:100%;border-collapse:collapse;font-size:14px">${lines.map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f0e8da">${l.qty} × ${esc(l.name)}${l.opts && l.opts.length ? `<div style="color:#7a6e5d;font-size:12px">${esc(l.opts.join(" · "))}</div>` : ""}${l.note ? `<div style="color:#7a6e5d;font-size:12px">« ${esc(l.note)} »</div>` : ""}</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f0e8da">${euro(l.unit * l.qty)}</td></tr>`).join("")}</table>`;

// ---------- chef login ----------
const COOKIE = "ms_admin";
const secret = () => process.env.ADMIN_SECRET || (process.env.ADMIN_PASSWORD ? "pw:" + process.env.ADMIN_PASSWORD : "");
function signSession() {
  const exp = Date.now() + 30 * 864e5;
  const sig = createHmac("sha256", secret()).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}
function isAdmin(req) {
  if (!secret()) return false;
  const m = (req.headers.cookie || "").match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!(Number(exp) > Date.now()) || !sig) return false;
  const want = createHmac("sha256", secret()).update(exp).digest("hex");
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
function passwordOk(pw) {
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real) return false;
  const a = createHmac("sha256", "cmp").update(String(pw || "")).digest(), b = createHmac("sha256", "cmp").update(real).digest();
  return timingSafeEqual(a, b);
}
const cookieHeader = (value, maxAge) => `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------- misc ----------
const baseUrl = (req) => `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}`;
const clean = (s, n = 200) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || "");
const validPhone = (s) => (String(s || "").replace(/[^\d+]/g, "").length >= 9);

// Small per-instance brake on form spam.
const hits = new Map();
function rateOk(req, max = 8, windowSec = 600) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  const now = Date.now(), h = hits.get(ip);
  if (!h || h.until < now) { hits.set(ip, { n: 1, until: now + windowSec * 1000 }); return true; }
  return ++h.n <= max;
}

module.exports = {
  MENU, CONFIG, ITEM, TRAY, storeReady, readJson, writeJson, listJson, getSettings, code, token, parisNow, dayDiff, isDate, slotError,
  priceCart, stripe, checkoutSession, verifyStripe, sendMail, esc, euro, frDate, mailLayout, linesTable,
  isAdmin, signSession, passwordOk, cookieHeader, baseUrl, clean, validEmail, validPhone, rateOk,
};
