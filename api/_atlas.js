// Shared helpers for the Atlas Cloud proxy functions.
const BASE = "https://api.atlascloud.ai/api/v1";
const PUBLIC_BASE = "https://api.atlascloud.ai/public/v1"; // billing/account endpoints live here, not /api/v1

const { requireUser } = require("./_db");

// Every studio endpoint needs a signed-in account (see api/auth.js). Resolves
// to the user, or null after sending 401 — callers: if (!(await checkAccess(req, res))) return;
const checkAccess = (req, res) => requireUser(req, res);

// One studio Atlas key, kept only on the server (ATLASCLOUD_API_KEY in Vercel).
// Nobody types or sees it; every account's generations use it.
function apiKey(res) {
  const key = String(process.env.ATLASCLOUD_API_KEY || "").trim();
  if (!key) {
    res.status(503).json({ error: "The studio's Atlas Cloud key isn't set up yet: add ATLASCLOUD_API_KEY in Vercel, then redeploy." });
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
    else p.duration = Math.max(4, Math.min(is25 ? 30 : 15, d)); // integer seconds: 4–30 on Seedance 2.5, 4–15 otherwise
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
    // Starting from an image, the video takes that image's shape. Seedance
    // refuses any fixed ratio here (400: "the output aspect ratio follows the
    // first-frame image. Set ratio to adaptive or omit it"), so never send one.
    delete body.aspect_ratio;
    if (/seedance/i.test(m)) body.ratio = "adaptive"; else delete body.ratio;
    body.image = urls[0]; // video takes a single start frame
    return body;
  }

  body.model = m;
  if (mode === "audio" && !isSongModel) body.text = prompt || ""; else body.prompt = prompt || "";
  Object.assign(body, params || {});
  return body;
}

module.exports = { checkAccess, apiKey, atlas, PUBLIC_BASE, buildBody };
