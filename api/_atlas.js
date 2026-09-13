// Shared helpers for the Atlas Cloud proxy functions.
const BASE = "https://api.atlascloud.ai/api/v1";
const PUBLIC_BASE = "https://api.atlascloud.ai/public/v1"; // billing/account endpoints live here, not /api/v1

const { timingSafeEqual } = require("crypto");
const same = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function checkAccess(req, res) {
  const expected = String(process.env.STUDIO_PASSWORD || "").trim(); // a pasted trailing space/newline in Vercel must not lock everyone out
  if (!expected) return true; // no password configured
  const given = String(req.headers["x-studio-key"] || "").trim();
  if (same(given, expected)) return true;
  // Diagnostic that never reveals either value: enough to tell "not sent" from
  // "typed something else" from "Caps Lock / keyboard layout" in the logs.
  const why = !given ? "no code sent"
    : given.length !== expected.length ? `length ${given.length} vs ${expected.length}`
    : given.toLowerCase() === expected.toLowerCase() ? "case-only mismatch (Caps Lock?)"
    : "same length, different characters";
  console.log("access code rejected:", why);
  res.status(401).json({ error: "Wrong access code." });
  return false;
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

async function atlas(path, key, init = {}, base = BASE) {
  const r = await fetch(base + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) {
    // Surface everything Atlas gives on a failure — status text, any error code,
    // the raw body, and a couple of diagnostic headers. A bare 401 with no body
    // is itself a clue (key valid but not permitted), so never hide it.
    const detail = json?.message || json?.error || json?.msg || (text && text.slice(0, 300)) || r.statusText || "";
    const code = json?.code || json?.error_code || "";
    const reqId = r.headers.get("x-request-id") || r.headers.get("x-atlas-request-id") || "";
    console.log(`atlas ${r.status} ${path} | code=${code} | detail=${JSON.stringify(detail).slice(0,300)} | reqId=${reqId}`);
    throw new Error(`Atlas Cloud returned ${r.status}${detail ? ": " + detail : ""}`);
  }
  return json;
}

// Shared by generate.js and estimate.js, so a real generation and its cost
// estimate are always built from an identical request body.
// Voice models (ElevenLabs) take `text`; song models (Suno) take `prompt`,
// same as image/video. Sending `text` to a song model is silently ignored.
// image_url may be a single URL string (the proven path — unchanged) or an
// array of several. Different model families use different field names for
// multiple references, and none of that is confirmed against a real Atlas
// Cloud response yet — generate.js/estimate.js log the outgoing body whenever
// there's more than one, so a wrong guess here is a log line, not a re-guess.
function buildBody(mode, model, prompt, image_url, params) {
  const isSongModel = /suno|chirp|music|udio/i.test(model || "");
  const body = mode === "audio" && !isSongModel
    ? { model, text: prompt || "", ...(params || {}) }
    : { model, prompt: prompt || "", ...(params || {}) };

  const urls = Array.isArray(image_url) ? image_url.filter(Boolean) : (image_url ? [image_url] : []);
  if (urls.length === 1) {
    body.image_url = urls[0];
  } else if (urls.length > 1) {
    if (/gpt-image|openai/i.test(model || "")) body.image = urls; // OpenAI's real Images API field
    else body.image_urls = urls; // best-guess convention for Seedream, Nano Banana, everything else
  }
  return body;
}

module.exports = { checkAccess, apiKey, atlas, PUBLIC_BASE, buildBody };
