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
    const detail = json?.message || json?.error?.message || json?.msg
      || (typeof json?.error === "string" ? json.error : "")
      || (text && text.slice(0, 300)) || r.statusText || "";
    const code = json?.code || json?.error?.code || json?.error_code || "";
    const reqId = r.headers.get("x-request-id") || r.headers.get("x-atlas-request-id") || "";
    console.log(`atlas ${r.status} ${path} | code=${code} | detail=${JSON.stringify(detail).slice(0,300)} | reqId=${reqId}`);
    throw new Error(`Atlas Cloud returned ${r.status}${detail ? ": " + detail : ""}`);
  }
  return json;
}

// Shared by generate.js and estimate.js, so a real generation and its cost
// estimate are always built from an identical request body.
//
// The important, hard-won rule: a text-to-image / text-to-video model IGNORES
// any reference images you send it. To actually USE references you must call
// the model's EDIT (image) or IMAGE-TO-VIDEO variant, and pass the images
// under the field that variant expects. Confirmed against Atlas Cloud's docs:
//   google/nano-banana-pro/text-to-image  →  .../edit,  field: images[] (1-10)
//   openai/gpt-image-2/text-to-image       →  .../edit,  field: images[] (1-10)
// So when references are attached we rewrite the model id to its edit variant
// and send `images`. buildBody returns the model it actually used, so the
// caller can log/record it.
// GPT Image models speak `size` (pixel dimensions) + `quality`, NOT the
// aspect_ratio/resolution (1k/2k/4k) every other image model here uses.
// Sending the wrong ones risks a hard 400, so translate for gpt-image only.
const GPT_SIZE = {
  square:    { "1k":"1024x1024", "2k":"2048x2048", "4k":"2048x2048" },
  landscape: { "1k":"1536x1024", "2k":"2048x1152", "4k":"3840x2160" },
  portrait:  { "1k":"1024x1536", "2k":"1152x2048", "4k":"2160x3840" },
};
function gptTranslate(params) {
  const p = { ...(params || {}) };
  const ar = p.aspect_ratio || p.ratio; const res = p.resolution || "2k";
  delete p.aspect_ratio; delete p.ratio; delete p.resolution;
  if (ar && !p.size) {
    const orient = ar === "1:1" ? "square"
      : /^(9:16|2:3|3:4|4:5)$/.test(ar) ? "portrait" : "landscape";
    p.size = (GPT_SIZE[orient] || GPT_SIZE.square)[res] || "2048x2048";
  }
  if (!p.quality) p.quality = "high";
  return p;
}

// Video models (Seedance especially) reject the friendly labels the UI uses.
// Confirmed from Atlas's own 400s: "2k" is NOT a valid resolution — Seedance
// wants 720p / 1080p / 1440p-sr / 4k, and 2.5 uses the -esr variants for 4k.
// And a non-integer or out-of-range duration ("3.5") is refused with
// "requested video duration is not supported". Translate both so a valid
// request is always sent. Only the resolution vocab is Seedance-specific;
// forcing an integer, in-range duration is safe for any video model.
function videoTranslate(model, params) {
  const p = { ...(params || {}) };
  const isSeedance = /seedance/i.test(model || "");
  const is25 = /seedance-2\.5/i.test(model || "");
  if (isSeedance && p.resolution) {
    const RMAP = {
      "1k": "720p", "720p": "720p", "1080p": "1080p",
      "2k": "1440p-sr", "1440p": "1440p-sr",
      "4k": is25 ? "4k-esr" : "4k", "480p": "480p",
    };
    if (RMAP[p.resolution]) p.resolution = RMAP[p.resolution];
  }
  if (p.duration != null && p.duration !== "") {
    let d = Math.round(Number(p.duration));
    if (!Number.isFinite(d)) delete p.duration;        // garbage in → let the model default
    else p.duration = Math.max(3, Math.min(12, d));    // Seedance's supported range
  } else {
    delete p.duration; // empty = the model's own default ("Auto"), which always works
  }
  return p;
}

function buildBody(mode, model, prompt, image_url, params) {
  const isSongModel = /suno|chirp|music|udio/i.test(model || "");
  const isGptImage = /gpt-image/i.test(model || "");
  const urls = Array.isArray(image_url) ? image_url.filter(Boolean) : (image_url ? [image_url] : []);
  if (mode === "image" && isGptImage) params = gptTranslate(params);
  if (mode === "video") params = videoTranslate(model, params);

  let m = model || "";
  const body = {};

  if (mode === "image" && urls.length) {
    m = m.replace(/\/(text-to-image|t2i)$/i, "/edit"); // route to the edit endpoint
    body.model = m; body.prompt = prompt || "";
    Object.assign(body, params || {});
    body.images = urls.slice(0, 10); // confirmed field + cap
    return body;
  }
  if (mode === "video" && urls.length) {
    m = m.replace(/\/(text-to-video|t2v)$/i, "/image-to-video"); // route to i2v
    body.model = m; body.prompt = prompt || "";
    Object.assign(body, params || {});
    body.image = urls[0]; // video takes a single start frame
    return body;
  }

  body.model = m;
  if (mode === "audio" && !isSongModel) body.text = prompt || ""; else body.prompt = prompt || "";
  Object.assign(body, params || {});
  return body;
}

module.exports = { checkAccess, apiKey, atlas, PUBLIC_BASE, buildBody };
