// Copy a finished take from Atlas's storage into the private Blob store, so it
// never expires. Used by /api/file (the page) and /api/mcp (Claude).
const db = require("./_db");
let blob = null;
try { blob = require("@vercel/blob"); } catch {}

// Same hosts /api/media accepts: where Atlas Cloud's models deliver results.
const ALLOWED_HOST = /(^|\.)(aliyuncs\.com|volces\.com|byteimg\.com|atlascloud\.ai|amazonaws\.com|googleapis\.com|cloudfront\.net|r2\.dev|replicate\.delivery|fal\.media)$/i;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg" };

async function keepUrl(user, url, id) {
  let target;
  try { target = new URL(String(url || "")); } catch { const e = new Error("Bad url."); e.status = 400; throw e; }
  if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) { const e = new Error("This host isn't allowed: " + target.hostname); e.status = 400; throw e; }
  const safeId = String(id || Date.now()).replace(/[^\w-]/g, "").slice(0, 80) || String(Date.now());
  const up = await fetch(target);
  if (!up.ok || !up.body) throw new Error(`Atlas storage returned ${up.status} — the file may have expired.`);
  const type = (up.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type] || (target.pathname.match(/\.(\w{2,5})$/) || [, "bin"])[1].toLowerCase();
  const size = Number(up.headers.get("content-length")) || 0;
  const path = `media/${db.fileKey(user.name)}/${safeId}.${ext}`;
  await blob.put(path, up.body, {
    access: "private", contentType: type || "application/octet-stream", addRandomSuffix: false, allowOverwrite: true,
    multipart: size > 8 * 1024 * 1024 || /^video\//.test(type), // big files go up in parts
  });
  return { path, size, type };
}
module.exports = { keepUrl };
