/* Illume — shared behaviour. No build step, no libraries.
   Scrolling is the browser's own. Everything respects prefers-reduced-motion. */
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* intro sweep: once per visit */
  var intro = $(".intro");
  if (intro) { try { if (sessionStorage.getItem("illume-intro")) intro.remove(); else sessionStorage.setItem("illume-intro", "1"); } catch (e) {} }

  /* header turns solid once scrolled */
  var top = $(".top");
  if (top) { var hb = function () { top.classList.toggle("scrolled", scrollY > 60); }; addEventListener("scroll", hb, { passive: true }); hb(); }

  /* reveal */
  var io = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
  $$(".rv").forEach(function (el) { io.observe(el); });

  /* hero spotlight */
  var lit = $(".mosaic-lit"), hero = $(".hero");
  if (lit && hero) {
    var sx = innerWidth * .62, sy = innerHeight * .42, tx = sx, ty = sy, auto = !fine, t0 = performance.now();
    if (fine) { hero.addEventListener("pointermove", function (e) { tx = e.clientX; ty = e.clientY; auto = false; }, { passive: true }); hero.addEventListener("pointerleave", function () { auto = true; }); }
    /* The mask is repainted every frame it moves, so the loop only runs while
       the hero is on screen and the light is still travelling. With a mouse the
       light rests where you leave it; on touch it drifts on its own. */
    var spotOn = true, running = false;
    var spot = function () {
      if (!spotOn) { running = false; return; }
      if (auto) { var t = (performance.now() - t0) / 1000; tx = innerWidth * (.5 + .32 * Math.sin(t * .35)); ty = innerHeight * (.42 + .22 * Math.sin(t * .53 + 1)); }
      sx += (tx - sx) * .08; sy += (ty - sy) * .08; lit.style.setProperty("--mx", sx + "px"); lit.style.setProperty("--my", sy + "px");
      if (!auto && Math.abs(tx - sx) < .3 && Math.abs(ty - sy) < .3) { running = false; return; }
      requestAnimationFrame(spot);
    };
    var wake = function () { if (!running) { running = true; requestAnimationFrame(spot); } };
    if (fine) hero.addEventListener("pointermove", wake, { passive: true });
    new IntersectionObserver(function (es) { spotOn = es[0].isIntersecting; if (spotOn) wake(); }).observe(hero);
    wake();
  }

  /* the work strip: drag it sideways with a mouse, swipe it on touch.
     The page keeps scrolling normally either way. */
  var strip = $("#strip"), swrap = strip && strip.parentNode;
  if (strip && swrap && fine) {
    var down = false, x0 = 0, left0 = 0, moved = 0;
    swrap.addEventListener("pointerdown", function (e) {
      down = true; moved = 0; x0 = e.clientX; left0 = swrap.scrollLeft; swrap.style.cursor = "grabbing";
    });
    swrap.addEventListener("pointermove", function (e) {
      if (!down) return;
      var d = e.clientX - x0; moved = Math.max(moved, Math.abs(d));
      swrap.scrollLeft = left0 - d;
      if (moved > 4) e.preventDefault();
    });
    var up = function () { down = false; swrap.style.cursor = ""; };
    swrap.addEventListener("pointerup", up); swrap.addEventListener("pointerleave", up);
    swrap.addEventListener("click", function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    swrap.style.cursor = "grab";
  }

  /* the light slider */
  var stage = $(".stage");
  if (stage) {
    var rng = $("input", stage);
    var setPos = function (v) { v = Math.max(0, Math.min(100, v)); stage.style.setProperty("--pos", v + "%"); rng.value = v; };
    var at = function (e) { var b = stage.getBoundingClientRect(); setPos((e.clientX - b.left) / b.width * 100); };
    var drag = false;
    stage.addEventListener("pointerdown", function (e) {
      drag = true; at(e); e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      rng.focus({ preventScroll: true });
    });
    stage.addEventListener("pointermove", function (e) { if (drag) at(e); });
    var stop = function (e) { if (!drag) return; drag = false; try { stage.releasePointerCapture(e.pointerId); } catch (err) {} };
    stage.addEventListener("pointerup", stop); stage.addEventListener("pointercancel", stop);
    rng.addEventListener("input", function () { stage.style.setProperty("--pos", rng.value + "%"); });
    if (!reduce) {
      var seen = false;
      new IntersectionObserver(function (es, o) {
        if (!es[0].isIntersecting || seen) return; seen = true; o.disconnect();
        var from = 62, to = 42, s0 = null;
        (function st(t) { if (s0 === null) s0 = t; var p = Math.min(1, (t - s0) / 1400); setPos(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(st); })(performance.now());
      }, { threshold: .5 }).observe(stage);
    }
  }

  /* videos: play in view; if the phone blocks autoplay, offer a tap */
  $$(".frame video, .frame16 video").forEach(function (v) {
    var box = v.parentNode, snd = $(".snd", box);
    var isAd = box.classList.contains("frame16");
    var hasFile = !!v.querySelector("source");

    if (isAd) {
      var ready = function () { box.classList.add("ready"); };
      v.addEventListener("loadeddata", ready);
      v.addEventListener("error", function () { box.classList.remove("ready"); }, true);
      if (v.readyState >= 2) ready();
    }
    if (!hasFile) return;           /* the film slot until the file lands */
    if (reduce) { v.controls = true; return; }

    /* wants = we asked for playback. If the phone refuses or stops it
       (Low Power Mode, data saver), a tap badge appears over the frame. */
    var wants = false;
    var tryPlay = function () {
      wants = true;
      var p = v.play();
      if (p && p.catch) p.catch(function () { if (wants) box.classList.add("tap"); });
    };
    var stop = function (badge) { wants = false; v.pause(); box.classList.toggle("tap", !!badge); };

    v.addEventListener("playing", function () { box.classList.remove("tap"); });
    v.addEventListener("pause", function () { if (wants) box.classList.add("tap"); });

    new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) tryPlay(); else stop(false); });
    }, { threshold: 0.25 }).observe(v);

    box.addEventListener("click", function (e) {
      if (e.target.closest(".snd")) return;
      if (v.paused) { box.classList.remove("tap"); tryPlay(); } else stop(true);
    });

    if (snd) snd.addEventListener("click", function () {
      v.muted = !v.muted;
      if (!v.muted) { v.currentTime = 0; tryPlay(); }
      snd.textContent = v.muted ? "Sound on" : "Sound off";
      snd.setAttribute("aria-pressed", String(!v.muted));
    });
  });

  /* count-up */
  if (!reduce) $$("[data-to]").forEach(function (el) {
    var to = +el.dataset.to; el.textContent = "0";
    new IntersectionObserver(function (es, o) { if (!es[0].isIntersecting) return; o.disconnect(); var s = null; (function st(t) { if (s === null) s = t; var p = Math.min(1, (t - s) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(st); })(performance.now()); }, { threshold: .5 }).observe(el);
  });

  /* magnetic buttons */
  if (fine) $$(".mag").forEach(function (m) {
    m.addEventListener("pointermove", function (e) { var b = m.getBoundingClientRect(); m.style.transform = "translate(" + (e.clientX - (b.left + b.width / 2)) * .35 + "px," + (e.clientY - (b.top + b.height / 2)) * .35 + "px)"; }, { passive: true });
    m.addEventListener("pointerleave", function () { m.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1)"; m.style.transform = ""; setTimeout(function () { m.style.transition = ""; }, 600); });
  });

  /* work page: tap to flip on touch */
  /* work page: tap or click a B piece to see what we started from.
     It holds for four seconds, then goes back on its own. */
  $$(".piece.flip").forEach(function (p) {
    var timer = null;
    var hide = function () { clearTimeout(timer); timer = null; p.classList.remove("show"); };
    var show = function () {
      clearTimeout(timer);
      p.classList.add("show");
      timer = setTimeout(function () { p.classList.remove("show"); timer = null; }, 4000);
    };
    var toggle = function () { p.classList.contains("show") ? hide() : show(); };
    p.addEventListener("click", toggle);
    p.setAttribute("tabindex", "0");
    p.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });
})();
