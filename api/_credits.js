// Credits: members pay for generations with credits bought through Stripe;
// the owner (first account) generates on the studio's own Atlas key, free.
//
// A generation costs  ceil(Atlas price × (1 + CREDIT_MARKUP) × 100)  credits,
// so members only ever see credits — never Atlas's prices or the markup.
// Credits switch on when STRIPE_SECRET_KEY is set (or CREDITS=on).
//
// Files in the private Blob store:
//   wallet/<user>.json → { credits, ledger[], pending[], done[], holds{}, referredBy }
//   refs/<code>.json   → { name }     referral code → who owns it
//   locks/<user>       → a short-lived lock so two generations can't both spend
//                        the same credits (created with no-overwrite = atomic)
const { createHmac, createHash } = require("crypto");
const db = require("./_db");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const MARKUP = () => num(process.env.CREDIT_MARKUP, 0.30);
const REF_PCT = () => num(process.env.REFERRAL_PERCENT, 0); // referrals off unless set
const FREE = () => Math.max(0, Math.round(num(process.env.FREE_CREDITS, 0)));
const enabled = () => !!(process.env.STRIPE_SECRET_KEY || process.env.CREDITS === "on");
const PACKS = [
  { id: "p25", usd: 25, credits: 1500 },
  { id: "p50", usd: 50, credits: 3500, bonus: "+17% more credits per $" },
  { id: "p100", usd: 100, credits: 9000, bonus: "Best value · +50% per $" },
];
const creditsFor = usd => Math.max(1, Math.ceil(num(usd, 0) * (1 + MARKUP()) * 100));
// Members pay; the owner never does.
const pays = user => enabled() && user && user.role !== "owner";

const secret = () => createHash("sha256").update("illume-ref:" + (process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "")).digest();
const refCode = name => createHmac("sha256", secret()).update(String(name)).digest("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
let heldCache = null; // all members' unspent credits, briefly cached
const walletPath = name => `wallet/${db.fileKey(name)}.json`;
const empty = () => ({ credits: 0, ledger: [], pending: [], done: [], holds: {} });

async function getWallet(name) { const r = await db.readJson(walletPath(name)); return Object.assign(empty(), (r && r.value) || {}); }
async function putWallet(name, w) {
  w.ledger = (w.ledger || []).slice(-200); w.done = (w.done || []).slice(-500);
  const hk = Object.keys(w.holds || {}); if (hk.length > 150) hk.slice(0, hk.length - 150).forEach(k => delete w.holds[k]);
  await db.writeJson(walletPath(name), w);
  heldCache = null; // totals changed
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Run fn(wallet) with the user's wallet locked; whatever it returns is returned.
async function withWallet(name, fn) {
  const lock = `locks/${db.fileKey(name)}`;
  for (let i = 0; ; i++) {
    try { await db.writeJson(lock, { at: Date.now() }, { overwrite: false }); break; }
    catch (e) {
      if (!db.alreadyExists(e)) throw e;
      const cur = await db.readJson(lock).catch(() => null);
      if (cur && cur.value && Date.now() - cur.value.at > 20000) { await blob.del(lock).catch(() => {}); continue; } // stale lock
      if (i > 60) throw new Error("Your credits are busy — try again in a moment.");
      await sleep(150 + Math.random() * 200);
    }
  }
  try {
    const w = await getWallet(name);
    const out = await fn(w);
    await putWallet(name, w);
    return out;
  } finally { await blob.del(lock).catch(() => {}); }
}
const entry = (w, type, amount, note) => { w.ledger.push({ t: Date.now(), type, amount, note: note || "" }); };

// Make sure this user's referral code points back to them.
async function ensureRefCode(name) {
  const code = refCode(name);
  const r = await db.readJson(`refs/${code}.json`).catch(() => null);
  if (!r || !r.value) await db.writeJson(`refs/${code}.json`, { name }).catch(() => {});
  return code;
}
async function whoseCode(code) {
  if (!/^[a-zA-Z0-9]{4,16}$/.test(String(code || ""))) return null;
  const r = await db.readJson(`refs/${code}.json`).catch(() => null);
  return (r && r.value && r.value.name) || null;
}
// New account: remember who referred them, and give any welcome credits.
async function onSignup(name, ref) {
  await ensureRefCode(name);
  const by = await whoseCode(ref);
  if (by && by !== name) await withWallet(by, w => { w.refCount = (w.refCount || 0) + 1; }).catch(() => {});
  if (!enabled() && !by) return;
  await withWallet(name, w => {
    if (by && by !== name) w.referredBy = by;
    if (FREE() && !w.welcomed) { w.credits += FREE(); w.welcomed = true; entry(w, "welcome", FREE(), "Welcome credits"); }
  });
}

// ---- Can the Atlas balance cover what's been sold? ----
// 1 credit = $1 / (100 × (1 + markup)) of Atlas spend. Credits members already
// hold are money the studio still owes Atlas; a new pack may only be sold if the
// Atlas balance covers those AND the new pack. Otherwise the pack is paused.
const usdToCredits = usd => Math.floor(Number(usd || 0) * 100 * (1 + MARKUP()));
async function creditsHeld(fresh) { // all unspent credits across every member's wallet
  if (!fresh && heldCache && Date.now() - heldCache.t < 30000) return heldCache.v;
  let total = 0, cursor;
  do {
    const r = await blob.list({ prefix: "wallet/", cursor, limit: 1000 });
    const ws = await Promise.all(r.blobs.map(b => db.readJson(b.pathname).catch(() => null)));
    ws.forEach(x => { if (x && x.value) total += Math.max(0, Number(x.value.credits) || 0); });
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  heldCache = { t: Date.now(), v: total };
  return total;
}
async function atlasBalanceUsd() {
  const { atlas, PUBLIC_BASE } = require("./_atlas");
  const key = String(process.env.ATLASCLOUD_API_KEY || "").trim();
  const out = await atlas("/balance", key, {}, PUBLIC_BASE);
  const d = (out && out.data) || out || {};
  const pick = o => (o && typeof o === "object" ? o.value : o);
  const v = Number(pick(d.available) ?? pick(d.cash) ?? d.value ?? d.balance ?? d.amount);
  if (!Number.isFinite(v)) throw new Error("Couldn't read the Atlas balance.");
  return v;
}
// → { atlasUsd, covers, held, room }  room = credits that can still be sold safely
async function coverage(fresh) {
  const [atlasUsd, held] = await Promise.all([atlasBalanceUsd(), creditsHeld(fresh)]);
  const covers = usdToCredits(atlasUsd);
  return { atlasUsd, covers, held, room: Math.max(0, covers - held), perUsd: usdToCredits(1) };
}

module.exports = { coverage, enabled, pays, PACKS, creditsFor, MARKUP, REF_PCT, refCode, ensureRefCode, whoseCode, getWallet, withWallet, entry, onSignup };
