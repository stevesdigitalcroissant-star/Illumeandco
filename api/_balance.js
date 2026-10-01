const { checkAccess, apiKey, atlas, PUBLIC_BASE } = require("./_atlas");
const C = require("./_credits");

// Atlas Cloud's account balance — a different base path (/public/v1) than
// every other endpoint here (/api/v1), so it's passed explicitly to atlas().
module.exports = async (req, res) => {
  const user = await checkAccess(req, res);
  if (!user) return;
  // The studio account's balance is only shown to the owner (the first account).
  res.setHeader("Cache-Control", "no-store");
  if (user.role !== "owner") {
    if (!C.enabled()) return res.status(200).json({ value: null });
    const w = await C.getWallet(user.name).catch(() => ({ credits: 0 }));
    return res.status(200).json({ credits: w.credits });
  }
  const key = apiKey(res);
  if (!key) return;
  try {
    const out = await atlas("/balance", key, {}, PUBLIC_BASE);
    // Docs show a flat {value, currency}; every other Atlas endpoint tonight
    // actually wrapped its payload in {code, data:{...}} — accept both, and
    // log the raw shape once so a mismatch is a log line, not a blank header.
    console.log("balance response shape:", JSON.stringify(out).slice(0, 300));
    // Confirmed real shape: { available:{value,currency}, cash:{...}, bonus:{...} }.
    // "available" is an object, not a number — read its nested .value.
    const d = out?.data || out;
    const pick = o => (o && typeof o === "object" ? o.value : o);
    const raw = pick(d.available) ?? pick(d.cash) ?? d.value ?? d.balance ?? d.amount ?? null;
    const currency = d.available?.currency || d.cash?.currency || d.currency || "usd";
    res.setHeader("Cache-Control", "no-store"); // this number changes with every generation — never let the browser cache it
    res.status(200).json({ value: raw == null ? null : Number(raw), currency });
  } catch (e) {
    console.log("balance failed:", e.message);
    res.status(502).json({ error: e.message });
  }
};
