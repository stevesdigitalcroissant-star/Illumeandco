// Streams a generated image/video from Atlas Cloud's storage through our own
// domain. Two reasons this exists:
//  1. Results live on *.aliyuncs.com (Alibaba Cloud). At least one browser
//     setup refused to render <img> from that host while curl and a clean
//     Chromium on the same machine loaded it fine — an extension / tracking
//     protection, most likely. Loading from illumeandco.online sidesteps that.
//  2. The <a download> attribute only works same-origin, so a direct link to
//     the storage host opens the file instead of downloading it. Through here
//     it downloads, with a real filename.
//
// No password check: an <img src> can't send custom headers. So this is
// restricted to the public object-storage / CDN hosts that Atlas Cloud's
// models actually deliver results from — keeping it from being an open relay
// for arbitrary URLs, while covering every model's output host. Different
// models use different storage: Atlas/Alibaba (aliyuncs.com), ByteDance
// Volcano Engine for Seedream/Seedance (volces.com / byteimg.com), plus the
// usual public clouds other models route through. It streams rather than
// buffers, so a 4K image or a video isn't capped by the 4.5MB response limit.
const { Readable } = require("stream");

const ALLOWED_HOST = /(^|\.)(aliyuncs\.com|volces\.com|byteimg\.com|atlascloud\.ai|amazonaws\.com|googleapis\.com|cloudfront\.net|r2\.dev|replicate\.delivery|fal\.media)$/i;

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();
  const raw = req.query.url;
  let target;
  try { target = new URL(String(raw || "")); } catch { return res.status(400).json({ error: "Bad url." }); }
  if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
    console.log("media rejected host:", target.hostname); // if a new model uses a new host, it shows here
    return res.status(400).json({ error: "This media host isn't allowed: " + target.hostname });
  }

  let upstream;
  try { upstream = await fetch(target.toString(), { method: req.method }); }
  catch (e) { return res.status(502).json({ error: "Could not reach storage: " + e.message }); }
  if (!upstream.ok) return res.status(502).json({ error: `Storage returned ${upstream.status}` });

  const type = upstream.headers.get("content-type") || "application/octet-stream";
  res.setHeader("Content-Type", type);
  const len = upstream.headers.get("content-length"); if (len) res.setHeader("Content-Length", len);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // the URL is content-addressed; safe to cache hard
  if (req.query.download) {
    const name = String(req.query.name || target.pathname.split("/").pop() || "illume").replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  }
  if (req.method === "HEAD" || !upstream.body) return res.status(200).end();
  res.status(200);
  Readable.fromWeb(upstream.body).on("error", () => res.end()).pipe(res);
};
