/* Illume — shared behaviour. No dependencies.
   Scroll reveal, before/after slider, comparison count-up, desktop card tilt,
   reel autoplay in view. Everything respects prefers-reduced-motion. */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var ease = function (p) { return 1 - Math.pow(1 - p, 3); };

  /* Scroll reveal for .rv and .stagger blocks */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (x) {
      if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".rv, .stagger").forEach(function (el) { io.observe(el); });

  /* Before / after slider. The range input covers the whole frame, so drag or
     tap anywhere works; the visible line and knob just follow --pos. */
  document.querySelectorAll(".ba").forEach(function (ba) {
    var range = ba.querySelector("input[type=range]");
    if (!range) return;
    var set = function (v) { ba.style.setProperty("--pos", v + "%"); };
    range.addEventListener("input", function () { set(range.value); });
    set(range.value);
    if (reduce) return;
    var seen = false;
    var bio = new IntersectionObserver(function (entries) {
      entries.forEach(function (x) {
        if (!x.isIntersecting || seen) return;
        seen = true; bio.unobserve(ba);
        var from = +range.value, to = 50, t0 = null;
        var step = function (t) {
          if (t0 === null) t0 = t;
          var p = Math.min(1, (t - t0) / 1100);
          var v = from + (to - from) * ease(p);
          range.value = v; set(v);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.45 });
    bio.observe(ba);
  });

  /* Count-up on comparison numbers. Markup carries the final value, so with
     reduced motion (or no JS) the number is simply already there. */
  var nums = document.querySelectorAll("[data-to]");
  if (nums.length && !reduce) {
    var fmt = function (n) { return n.toLocaleString("en-US"); };
    nums.forEach(function (el) { el.textContent = "0"; });
    var nio = new IntersectionObserver(function (entries) {
      entries.forEach(function (x) {
        if (!x.isIntersecting) return;
        nio.unobserve(x.target);
        var el = x.target, to = +el.getAttribute("data-to"), t0 = null;
        var step = function (t) {
          if (t0 === null) t0 = t;
          var p = Math.min(1, (t - t0) / 1200);
          el.textContent = fmt(Math.round(to * ease(p)));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { nio.observe(el); });
  }

  /* Subtle 3D tilt on cards — desktop fine pointers only, never on touch */
  if (fine && !reduce) {
    document.querySelectorAll(".tilt").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = "perspective(900px) rotateX(" + (-y * 4).toFixed(2) + "deg) rotateY(" + (x * 4).toFixed(2) + "deg) translateY(-3px)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  }

  /* Reel: never loads on page start (preload=none). Plays only while in view. */
  var reel = document.querySelector(".reel video");
  if (reel) {
    reel.addEventListener("error", function () {
      reel.parentNode.classList.add("missing");
    }, true);
    if (!reduce) {
      var rio = new IntersectionObserver(function (entries) {
        entries.forEach(function (x) {
          if (x.isIntersecting) { var p = reel.play(); if (p && p.catch) p.catch(function () {}); }
          else { reel.pause(); }
        });
      }, { threshold: 0.35 });
      rio.observe(reel);
    }
  }
})();
