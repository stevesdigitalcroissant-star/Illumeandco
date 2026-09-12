// Shared helpers for the Atlas Cloud proxy functions.
const BASE = "https://api.atlascloud.ai/api/v1";

function checkAccess(req, res) {
  const expected = process.env.STUDIO_PASSWORD;
  if (!expected) return true; // no password configured
  const given = req.headers["x-studio-key"];
  if (given !== expected) {
    res.status(401).json({ error: "Wrong access code." });
    return false;
  }
  return true;
}

// The Atlas key can come from the browser (entered in Settings, stored on the user's device)
// or from the ATLASCLOUD_API_KEY environment variable on Vercel.
function apiKey(res, req) {
  const key = (req && req.headers["x-atlas-key"]) || process.env.ATLASCLOUD_API_KEY;
  if (!key) {
    res.status(428).json({ error: "No Atlas Cloud API key. Add it in Settings." });
    return null;
  }
  return key;
}

async function atlas(path, key, init = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) {
    const msg = json?.message || json?.error || json?.raw || `Atlas Cloud returned ${r.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return json;
}

module.exports = { checkAccess, apiKey, atlas };
