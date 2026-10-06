/*!
 * AI Front Office — website chat embed.
 * <script src="https://YOUR-APP/widget.js" data-key="pk_…" async></script>
 */
(function () {
  var script = document.currentScript || document.querySelector('script[src*="widget.js"][data-key]');
  if (!script || window.__afoWidget) return;
  window.__afoWidget = true;
  var key = script.getAttribute("data-key");
  var origin = new URL(script.src).origin;
  if (!key) return console.warn("[AI Front Office] widget.js is missing data-key");

  fetch(origin + "/api/widget/" + encodeURIComponent(key) + "/config")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(mount)
    .catch(function (e) { console.warn("[AI Front Office] widget unavailable", e); });

  function mount(cfg) {
    var side = cfg.position === "left" ? "left" : "right";
    var accent = /^#[0-9a-f]{6}$/i.test(cfg.accentColor) ? cfg.accentColor : "#0f766e";
    var open = false;

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", cfg.title || "Chat with us");
    button.style.cssText =
      "position:fixed;bottom:20px;" + side + ":20px;z-index:2147483646;width:56px;height:56px;border-radius:9999px;border:0;cursor:pointer;" +
      "background:" + accent + ";color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;transition:transform .15s";
    var chatIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var closeIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    button.innerHTML = chatIcon;

    var frame = document.createElement("iframe");
    frame.title = cfg.title || "Chat";
    frame.src = origin + "/widget/" + encodeURIComponent(key) + "?embed=1";
    frame.style.cssText =
      "position:fixed;bottom:88px;" + side + ":20px;z-index:2147483647;width:380px;height:600px;max-height:calc(100vh - 110px);max-width:calc(100vw - 40px);" +
      "border:0;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.2);background:#fff;display:none";

    function toggle(next) {
      open = typeof next === "boolean" ? next : !open;
      frame.style.display = open ? "block" : "none";
      button.innerHTML = open ? closeIcon : chatIcon;
    }
    button.addEventListener("click", function () { toggle(); });
    window.addEventListener("message", function (e) {
      if (e.origin === origin && e.data && e.data.type === "afo:close") toggle(false);
    });
    document.body.appendChild(frame);
    document.body.appendChild(button);
  }
})();
