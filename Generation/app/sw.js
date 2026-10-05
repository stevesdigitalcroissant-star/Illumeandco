// Illume app: keeps the studio's page on the device so the app opens instantly,
// and shows a friendly screen when there's no connection. Only the page itself is
// cached — your work, files and every /api call always come live from the server.
const CACHE = "illume-shell-v1";
const SHELL = ["/generation", "/Generation/app/icon-192.png", "/Generation/app/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const OFFLINE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Illume</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0C0B09;color:#F3EDE2;font:16px system-ui;text-align:center;padding:24px"><div><div style="width:14px;height:14px;border-radius:50%;background:#E8B54B;box-shadow:0 0 18px #E8B54B;margin:0 auto 18px"></div><h1 style="font:300 30px Georgia,serif;margin:0 0 8px">You're offline</h1><p style="color:#B4AA9A;margin:0 0 20px">Illume needs a connection to create and load your work.</p><button onclick="location.reload()" style="font:600 15px system-ui;border:0;border-radius:12px;padding:12px 22px;background:#E8B54B;color:#1A1408">Try again</button></div>`;
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return; // never touch your data
  if (req.mode === "navigate" && /^\/generation\/?$/i.test(url.pathname)) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("/generation", copy)); return r; })
      .catch(() => caches.match("/generation").then(r => r || new Response(OFFLINE, { headers: { "Content-Type": "text/html" } }))));
    return;
  }
  if (url.pathname.startsWith("/Generation/app/")) e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
