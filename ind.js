/* Illume — shared behaviour. No build step.
   Phones and tablets get CSS + IntersectionObserver only. Desktops with a mouse
   also load Three.js (the brass spark) and Lenis (smooth scroll) from a CDN.
   Everything respects prefers-reduced-motion. */
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var desk = fine && innerWidth > 900;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var load = function (src, cb) { var s = document.createElement("script"); s.src = src; s.async = true; s.onload = cb; document.head.appendChild(s); };

  /* intro sweep: once per visit */
  var intro = $(".intro");
  if (intro) { try { if (sessionStorage.getItem("illume-intro")) intro.remove(); else sessionStorage.setItem("illume-intro", "1"); } catch (e) {} }

  /* reveal */
  var io = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
  $$(".rv").forEach(function (el) { io.observe(el); });

  /* cursor */
  var cur = $(".cur"), lbl = $(".cur-lbl");
  if (fine && cur) {
    var mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
    addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    (function loop() { cx += (mx - cx) * .22; cy += (my - cy) * .22; var t = "translate(" + cx + "px," + cy + "px) translate(-50%,-50%)"; cur.style.transform = t; if (lbl) lbl.style.transform = t; requestAnimationFrame(loop); })();
    $$("a,button,summary,.card,.piece,.svc li,.stage").forEach(function (el) {
      el.addEventListener("pointerenter", function () { cur.classList.add("big"); if (lbl && (el.classList.contains("card") || el.classList.contains("piece"))) { lbl.textContent = el.classList.contains("flip") ? "Before" : "View"; lbl.classList.add("on"); } });
      el.addEventListener("pointerleave", function () { cur.classList.remove("big"); if (lbl) lbl.classList.remove("on"); });
    });
  }

  /* smooth scroll + 3D spark: desktop only */
  var lenis = null;
  if (desk && !reduce) {
    load("https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js", function () {
      if (!window.Lenis) return;
      lenis = new Lenis({ lerp: .09, smoothWheel: true });
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
      $$('a[href^="#"]').forEach(function (a) { a.addEventListener("click", function (e) { var el = $(a.getAttribute("href")); if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -10 }); } }); });
    });
    if ($("#gl")) load("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", spark);
  }

  /* hero spotlight */
  var lit = $(".mosaic-lit"), hero = $(".hero");
  if (lit && hero) {
    var sx = innerWidth * .62, sy = innerHeight * .42, tx = sx, ty = sy, auto = !fine, t0 = performance.now();
    if (fine) { hero.addEventListener("pointermove", function (e) { tx = e.clientX; ty = e.clientY; auto = false; }, { passive: true }); hero.addEventListener("pointerleave", function () { auto = true; }); }
    var spotOn = true;
    new IntersectionObserver(function (es) { spotOn = es[0].isIntersecting; }).observe(hero);
    (function spot() {
      if (spotOn) {
        if (auto) { var t = (performance.now() - t0) / 1000; tx = innerWidth * (.5 + .32 * Math.sin(t * .35)); ty = innerHeight * (.42 + .22 * Math.sin(t * .53 + 1)); }
        sx += (tx - sx) * .08; sy += (ty - sy) * .08; lit.style.setProperty("--mx", sx + "px"); lit.style.setProperty("--my", sy + "px");
      }
      requestAnimationFrame(spot);
    })();
  }

  function spark() {
    if (!window.THREE) return;
    var cv = $("#gl"), r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2));
    var sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, .1, 50); cam.position.set(0, 0, 7);
    var k = 1 / 52, sh = new THREE.Shape(); sh.moveTo(0, 52 * k); sh.bezierCurveTo(5 * k, 16 * k, 16 * k, 5 * k, 52 * k, 0); sh.bezierCurveTo(16 * k, -5 * k, 5 * k, -16 * k, 0, -52 * k); sh.bezierCurveTo(-5 * k, -16 * k, -16 * k, -5 * k, -52 * k, 0); sh.bezierCurveTo(-16 * k, 5 * k, -5 * k, 16 * k, 0, 52 * k);
    var geo = new THREE.ExtrudeGeometry(sh, { depth: .32, bevelEnabled: true, bevelThickness: .1, bevelSize: .08, bevelSegments: 6, curveSegments: 48 }); geo.center();
    var c = document.createElement("canvas"); c.width = c.height = 256; var g = c.getContext("2d");
    var rg = g.createRadialGradient(96, 84, 10, 128, 128, 150); rg.addColorStop(0, "#fff4cf"); rg.addColorStop(.28, "#f0c469"); rg.addColorStop(.55, "#9a6a1f"); rg.addColorStop(.8, "#3a2a12"); rg.addColorStop(1, "#120d06"); g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    g.globalAlpha = .55; var rg2 = g.createRadialGradient(170, 190, 4, 170, 190, 70); rg2.addColorStop(0, "#fff8e6"); rg2.addColorStop(1, "rgba(255,248,230,0)"); g.fillStyle = rg2; g.fillRect(0, 0, 256, 256);
    var mat = new THREE.MeshMatcapMaterial({ matcap: new THREE.CanvasTexture(c) });
    var mesh = new THREE.Mesh(geo, mat); mesh.scale.setScalar(2.2); sc.add(mesh);
    var small = new THREE.Mesh(geo, mat); small.scale.setScalar(.55); small.position.set(2.1, -1.6, -1); sc.add(small);
    function size() { var w = cv.clientWidth, h = cv.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } size(); addEventListener("resize", size);
    var rx = 0, ry = 0; addEventListener("pointermove", function (e) { ry = (e.clientX / innerWidth - .5) * .9; rx = (e.clientY / innerHeight - .5) * .6; }, { passive: true });
    var on = true; new IntersectionObserver(function (es) { on = es[0].isIntersecting; }).observe(cv);
    var t = 0; (function anim() { if (on) { t += .008; mesh.rotation.y += (ry + t * .6 - mesh.rotation.y) * .05; mesh.rotation.x += (rx + Math.sin(t * 1.3) * .25 - mesh.rotation.x) * .05; mesh.rotation.z = Math.sin(t * .7) * .15; mesh.position.y = Math.sin(t * 1.1) * .18; small.rotation.y -= .01; small.rotation.x += .006; small.position.y = -1.6 + Math.cos(t * .9) * .12; r.render(sc, cam); } requestAnimationFrame(anim); })();
  }

  /* horizontal strip: sticky wrapper, translate on scroll (desktop) */
  var strip = $("#strip"), pin = $(".strip-pin"), spacer = $(".strip-space");
  if (strip && pin && spacer && desk && !reduce) {
    var dist = 0;
    var measure = function () { dist = Math.max(0, strip.scrollWidth - innerWidth); spacer.style.height = dist + "px"; };
    measure(); addEventListener("resize", measure);
    var track = spacer.parentNode;
    var stripTick = function () {
      var p = Math.min(1, Math.max(0, -(track.getBoundingClientRect().top - innerHeight * .12) / (dist || 1)));
      strip.style.transform = "translate3d(" + (-p * dist) + "px,0,0)";
    };
    addEventListener("scroll", stripTick, { passive: true }); stripTick();
  }

  /* the light slider */
  var stage = $(".stage");
  if (stage) {
    var rng = $("input", stage);
    var setPos = function (v) { stage.style.setProperty("--pos", v + "%"); rng.value = v; };
    var follow = function (e) { var b = stage.getBoundingClientRect(); setPos(Math.max(2, Math.min(98, (e.clientX - b.left) / b.width * 100))); };
    stage.addEventListener("pointermove", follow, { passive: true }); stage.addEventListener("pointerdown", follow);
    rng.addEventListener("input", function () { stage.style.setProperty("--pos", rng.value + "%"); });
    if (fine) { stage.addEventListener("pointermove", function (e) { var b = stage.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5; stage.style.transform = "perspective(1100px) rotateX(" + (-y * 7) + "deg) rotateY(" + (x * 7) + "deg)"; }, { passive: true }); stage.addEventListener("pointerleave", function () { stage.style.transform = ""; }); }
    if (!reduce) {
      var seen = false;
      new IntersectionObserver(function (es, o) {
        if (!es[0].isIntersecting || seen) return; seen = true; o.disconnect();
        var from = 62, to = 40, s0 = null;
        (function st(t) { if (s0 === null) s0 = t; var p = Math.min(1, (t - s0) / 1400); setPos(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(st); })(performance.now());
      }, { threshold: .5 }).observe(stage);
    }
  }

  /* videos: autoplay muted in view, sound button, ad film placeholder */
  $$(".frame video, .frame16 video").forEach(function (v) {
    var box = v.parentNode, snd = $(".snd", box);
    var isAd = box.classList.contains("frame16");
    var ready = function () { box.classList.add("ready"); };
    if (isAd) { v.addEventListener("loadeddata", ready); v.addEventListener("error", function () { box.classList.remove("ready"); }, true); if (v.readyState >= 2) ready(); }
    if (!reduce) { new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { var p = v.play(); p && p.catch && p.catch(function () {}); } else v.pause(); }); }, { threshold: .4 }).observe(v); }
    else { v.controls = true; }
    if (snd) snd.addEventListener("click", function () { v.muted = !v.muted; if (!v.muted) { v.currentTime = 0; v.play(); } snd.textContent = v.muted ? "Sound on" : "Sound off"; snd.setAttribute("aria-pressed", String(!v.muted)); });
  });

  /* service hover previews */
  var fl = $(".float"), fi = $("#floatimg");
  if (fine && fl) {
    $$(".svc li").forEach(function (li) { li.addEventListener("pointerenter", function () { fi.src = li.dataset.img; fl.classList.add("on"); }); li.addEventListener("pointerleave", function () { fl.classList.remove("on"); }); });
    var fx = 0, fy = 0, fcx = 0, fcy = 0; addEventListener("pointermove", function (e) { fx = e.clientX + 140; fy = e.clientY; }, { passive: true });
    (function fm() { fcx += (fx - fcx) * .12; fcy += (fy - fcy) * .12; fl.style.left = fcx + "px"; fl.style.top = fcy + "px"; requestAnimationFrame(fm); })();
  }

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
  if (!fine) $$(".piece.flip").forEach(function (p) { p.addEventListener("click", function () { p.classList.toggle("show"); }); });
})();
