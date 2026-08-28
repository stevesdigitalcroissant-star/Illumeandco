#!/usr/bin/env python3
"""Build the Illume portfolio.

Writes two things from one source of truth:
  index.html                     - the folder version, images referenced from images/
  ../illume-selected-work-artifact.html - a single self-contained file with the
                                   images inlined, for publishing as an Artifact

Run from this directory:  python3 build.py
"""

import base64
import html
import pathlib
from PIL import Image

HERE = pathlib.Path(__file__).parent
IMAGES = HERE / "images"

# ---------------------------------------------------------------------------
# The work. Each piece is (file, caption).
# ---------------------------------------------------------------------------

SECTIONS = [
    {
        "id": "promotional",
        "title": "Promotional Campaigns",
        "blurb": "Social ads, launch posts and seasonal promos built to stop the scroll.",
        "items": [
            ("IMG_1282.jpg", "Small business sale — Instagram ad"),
            ("IMG_1286.jpg", "Ceramics collection — feed post"),
            ("IMG_1293.jpg", "Chef's Special — dinner promo"),
            ("IMG_1296.jpg", "Opening Week — launch offer"),
            ("IMG_1299.jpg", "New Menu — bakery announcement"),
            ("IMG_1297.jpg", "Seasonal Sale — apparel promo"),
        ],
    },
    {
        "id": "wallet",
        "title": "Product — Wallet Launch",
        "blurb": "Full-range flat lay and styled hero shot for a leather goods drop.",
        "items": [
            ("IMG_1188.jpg", "Full colour range — flat lay"),
            ("IMG_1190.jpg", "Hero product shot — styled"),
        ],
    },
    {
        "id": "logos",
        "title": "Brand Identity — Chunk'd",
        "blurb": "Wordmark, packaging and product photography for a stuffed-cookie brand.",
        "items": [
            ("IMG_1262.jpg", "Wordmark lockup"),
            ("IMG_1263.jpg", "Packaging application"),
            ("IMG_1268.jpg", "Stuffed chocolate chunk cookie"),
            ("IMG_1265.jpg", "M&M caramel-stuffed cookie"),
        ],
    },
    {
        "id": "food",
        "title": "Food & Confections",
        "blurb": "Product photography for bakeries, confectioners and dessert menus.",
        "items": [
            ("IMG_1269.jpg", "Peanut butter cup cookie"),
            ("IMG_1270.jpg", "Red velvet white-chocolate cookie"),
            ("IMG_1267.jpg", "Salted caramel blondie"),
            ("IMG_1149.jpg", "Strawberry & banana crêpe"),
            ("IMG_1306.jpg", "Harbour and Salt — sea salt caramels"),
        ],
    },
    {
        "id": "locations",
        "title": "Studio & Storefront",
        "blurb": "Interiors, counters and behind-the-scenes environments.",
        "items": [
            ("IMG_1287.jpg", "Retail concept store"),
            ("IMG_1156.jpg", "Terra & Stone — studio counter"),
            ("IMG_1275.jpg", "Bakery production kitchen"),
            ("IMG_1274.jpg", "Bakery back-of-house"),
        ],
    },
    {
        "id": "drinks",
        "title": "Beverage",
        "blurb": "Coffee, tonics and bottled drinks styled for social and print.",
        "items": [
            ("IMG_1289.jpg", "Latte art — espresso bar"),
            ("IMG_1150.jpg", "Larkspur — full tonic range"),
            ("IMG_1305.jpg", "Iced coffee — lifestyle"),
            ("IMG_1152.jpg", "Smoothie bowl — overhead"),
        ],
    },
    {
        "id": "cuisine",
        "title": "High-End Cuisine",
        "blurb": "Fine-dining plating for menus, press and campaigns.",
        "items": [
            ("IMG_1283.jpg", "Plating detail — tasting menu"),
            ("IMG_1157.jpg", "Duck breast, blackberry jus"),
            ("IMG_1292.jpg", "Chef's finishing touch"),
            ("IMG_1153.jpg", "Seared scallop, wine reduction"),
        ],
    },
    {
        "id": "skincare",
        "title": "Fragrance & Skincare",
        "blurb": "Studio product photography across fragrance and skincare.",
        "items": [
            ("IMG_1151.jpg", "Ashcombe — smoked cedar mist"),
            ("IMG_1302.jpg", "Fielding — restorative hand cream"),
            ("IMG_1304.jpg", "Tidewell — 24-hour body serum"),
            ("IMG_1155.jpg", "Botanica Studios — facial balm"),
            ("IMG_1130.jpg", "Anua — niacinamide serum"),
            ("IMG_1129.jpg", "Anua — serum macro detail"),
        ],
    },
    {
        "id": "hair",
        "title": "Hair & Salon",
        "blurb": "Editorial hair photography and in-salon lifestyle.",
        "items": [
            ("IMG_1307.jpg", "Lumière Studio Salon — editorial"),
            ("IMG_1308.jpg", "In-salon service"),
            ("IMG_1310.jpg", "Precision bob — portrait"),
            ("IMG_1298.jpg", "Salon retail shelf"),
        ],
    },
]

DISCIPLINES = [
    "Product Photography",
    "Campaign Creative",
    "Brand Identity",
    "Social Content",
    "On-location Filming",
    "Menu & Print",
    "Packaging",
]

# Websites are an add-on, not a headline service, so they sit outside the
# discipline list rather than competing with it.
FOOTNOTE = "Also available — website design."

TOTAL = sum(len(s["items"]) for s in SECTIONS)

# ---------------------------------------------------------------------------

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght'
         '@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,300;1,9..144,500'
         '&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500'
         '&display=swap" rel="stylesheet">')

CSS = """
/* ---- Tokens -------------------------------------------------------------
   Light is the base palette. Dark is a warm, low-glare counterpart — near
   black with a brown bias rather than grey, so the photography still reads
   as being on paper. Three states are covered: the viewer's OS preference
   when nothing is stamped, and either theme stamped explicitly by the
   toggle or the host.                                                     */
:root {
  --paper:      #FFFFFF;
  --panel:      #FAF9F7;
  --ink:        #12110F;
  --ink-soft:   #57534B;
  --ink-faint:  #8C877D;
  --line:       #E8E4DD;
  --line-soft:  #F1EEE9;
  --accent:     #FF4B12;
  --accent-text:#C2360D;
  --bar:        rgba(255, 255, 255, .86);
  --viewer:     #0B0A09;
  --display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --body: 'DM Sans', system-ui, -apple-system, sans-serif;
  --mono: 'DM Mono', ui-monospace, SFMono-Regular, monospace;
  --gut: 4px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper:      #100F0D;
    --panel:      #191713;
    --ink:        #F6F3ED;
    --ink-soft:   #B3ABA0;
    --ink-faint:  #837C71;
    --line:       #2E2A24;
    --line-soft:  #232019;
    --accent:     #FF5F2B;
    --accent-text:#FF8355;
    --bar:        rgba(16, 15, 13, .84);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --paper:      #100F0D;
  --panel:      #191713;
  --ink:        #F6F3ED;
  --ink-soft:   #B3ABA0;
  --ink-faint:  #837C71;
  --line:       #2E2A24;
  --line-soft:  #232019;
  --accent:     #FF5F2B;
  --accent-text:#FF8355;
  --bar:        rgba(16, 15, 13, .84);
  color-scheme: dark;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--paper); }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font-family: var(--body); font-size: 16px; line-height: 1.6;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
a { color: inherit; text-decoration: none; }
img { display: block; max-width: 100%; }
::selection { background: var(--accent); color: #fff; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

.shell { max-width: 1320px; margin: 0 auto; padding: 0 34px; }

/* ---- Top bar ---- */
.topbar {
  position: sticky; top: 0; z-index: 60;
  background: var(--bar);
  backdrop-filter: saturate(1.4) blur(14px);
  -webkit-backdrop-filter: saturate(1.4) blur(14px);
  border-bottom: 1px solid var(--line-soft);
}
.topbar-inner {
  max-width: 1320px; margin: 0 auto; padding: 15px 34px;
  display: flex; align-items: center; gap: 26px;
}
.wordmark {
  font-family: var(--display); font-weight: 600; font-size: 19px;
  letter-spacing: .02em; white-space: nowrap; flex: 0 0 auto;
}
.wordmark .dot { color: var(--accent); }
.pills {
  display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 0;
  /* Fade the ends so a half-scrolled pill doesn't read as a clipped mistake. */
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 26px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 26px), transparent 100%);
}
.pills::-webkit-scrollbar { display: none; }
.pill {
  display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
  font-family: var(--mono); font-size: 11px; letter-spacing: .02em;
  padding: 8px 14px; border-radius: 999px;
  border: 1px solid var(--line); color: var(--ink-soft);
  transition: color .25s ease, border-color .25s ease, background .25s ease;
}
.pill i { font-style: normal; color: var(--accent-text); font-weight: 500; }
.pill:hover { border-color: var(--ink); color: var(--ink); }
.pill.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.progress { height: 2px; background: var(--accent); width: 0; transition: width .12s linear; }
.theme {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--line); background: transparent; color: var(--ink-soft);
  transition: color .25s ease, border-color .25s ease, background .25s ease;
}
.theme:hover { color: var(--ink); border-color: var(--ink); }
.theme svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; }
.theme .moon { display: none; }
:root[data-theme="dark"] .theme .sun { display: none; }
:root[data-theme="dark"] .theme .moon { display: block; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .theme .sun { display: none; }
  :root:not([data-theme="light"]) .theme .moon { display: block; }
}

/* ---- Hero ---- */
.hero { padding: 92px 0 58px; }
.kicker {
  display: flex; align-items: center; gap: 12px;
  font-family: var(--mono); font-size: 11.5px; letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent-text); margin-bottom: 26px;
}
.kicker::before { content: ''; width: 32px; height: 1px; background: var(--accent); }
.hero h1 {
  margin: 0; max-width: 15ch; text-wrap: balance;
  font-family: var(--display); font-weight: 500;
  font-size: clamp(46px, 7.2vw, 88px); line-height: .96; letter-spacing: -.022em;
}
.hero h1 em { font-style: italic; font-weight: 300; color: var(--accent); }
.hero-row {
  display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr);
  gap: 56px; align-items: end; margin-top: 44px;
}
.hero-copy p { margin: 0; max-width: 56ch; font-size: 17px; line-height: 1.62; color: var(--ink-soft); }
.disciplines { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 26px; }
.disciplines span {
  font-size: 12.5px; font-weight: 500; padding: 7px 13px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 999px;
}
.footnote {
  margin: 16px 0 0; font-family: var(--mono); font-size: 11px;
  letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint);
}
.hero-side { display: flex; flex-direction: column; align-items: flex-start; gap: 30px; }
.figures { display: flex; gap: 40px; }
.figure-num {
  display: block; font-family: var(--display); font-weight: 500; font-size: 40px;
  line-height: 1; letter-spacing: -.02em; font-variant-numeric: tabular-nums;
}
.figure-label {
  display: block; margin-top: 8px; font-family: var(--mono); font-size: 10.5px;
  letter-spacing: .12em; text-transform: uppercase; color: var(--ink-faint);
}
.play {
  display: inline-flex; align-items: center; gap: 12px; cursor: pointer;
  font-family: var(--mono); font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink); background: none; border: 1px solid var(--ink);
  padding: 14px 22px; border-radius: 999px;
  transition: background .3s ease, color .3s ease, transform .3s ease;
}
.play:hover { background: var(--ink); color: var(--paper); transform: translateY(-2px); }
.play .tri {
  width: 0; height: 0; border-left: 7px solid currentColor;
  border-top: 4.5px solid transparent; border-bottom: 4.5px solid transparent;
}

/* ---- Body ---- */
.body-grid {
  max-width: 1320px; margin: 0 auto; padding: 0 34px 130px;
  display: grid; grid-template-columns: 196px minmax(0, 1fr); gap: 60px;
}
.rail { position: sticky; top: 96px; align-self: start; }
.rail-title {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .13em;
  text-transform: uppercase; color: var(--ink-faint); margin-bottom: 18px;
}
.rail ol { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line); }
.rail li { margin-left: -1px; }
.rail a {
  display: flex; gap: 11px; padding: 9px 0 9px 18px;
  border-left: 2px solid transparent; transition: border-color .3s ease;
}
.rail .n {
  font-family: var(--mono); font-size: 10.5px; color: var(--ink-faint);
  padding-top: 2px; font-variant-numeric: tabular-nums;
}
.rail .t { font-size: 12.5px; line-height: 1.35; color: var(--ink-soft); transition: color .3s ease; }
.rail a:hover .t { color: var(--ink); }
.rail li.on a { border-left-color: var(--accent); }
.rail li.on .t { color: var(--ink); font-weight: 600; }
.rail li.on .n { color: var(--accent-text); }

.work { min-width: 0; }
section.set { padding-top: 96px; scroll-margin-top: 96px; }
section.set:first-child { padding-top: 8px; }
.set-head { max-width: 62ch; margin-bottom: 30px; }
.set-index {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
  font-family: var(--mono); font-size: 11px; letter-spacing: .1em; color: var(--accent-text);
  font-variant-numeric: tabular-nums;
}
.set-index::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.set-head h2 {
  margin: 0 0 9px; font-family: var(--display); font-weight: 500;
  font-size: clamp(28px, 3.3vw, 38px); letter-spacing: -.018em; text-wrap: balance;
}
.set-head p { margin: 0; font-size: 15px; line-height: 1.55; color: var(--ink-soft); }

/* Masonry columns: every piece keeps its own proportions, so nothing is
   cropped — the promo graphics used to lose their headlines to a 4:5 crop. */
.gallery { column-count: 3; column-gap: var(--gut); }
.piece {
  break-inside: avoid; margin: 0 0 var(--gut); padding: 0;
  position: relative; display: block; width: 100%; cursor: zoom-in;
  background: var(--panel); overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--line-soft);
  opacity: 0; transform: translateY(14px);
  transition: opacity .7s cubic-bezier(.2, .7, .3, 1), transform .7s cubic-bezier(.2, .7, .3, 1);
}
.piece.seen { opacity: 1; transform: none; }
.piece img { width: 100%; height: auto; transition: transform .75s cubic-bezier(.2, .7, .3, 1); }
.piece:hover img { transform: scale(1.035); }
.piece figcaption {
  position: absolute; inset: auto 0 0 0; padding: 30px 13px 13px;
  display: flex; align-items: flex-end; justify-content: space-between; gap: 10px;
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .02em; color: #fff;
  background: linear-gradient(0deg, rgba(0,0,0,.66) 0%, rgba(0,0,0,.14) 62%, rgba(0,0,0,0) 100%);
  opacity: 0; transform: translateY(5px);
  transition: opacity .35s ease, transform .35s ease;
}
.piece:hover figcaption, .piece:focus-visible figcaption { opacity: 1; transform: none; }
.piece figcaption .idx { opacity: .7; font-variant-numeric: tabular-nums; }

/* ---- Lightbox ---- */
.lb {
  position: fixed; inset: 0; z-index: 200; background: var(--viewer);
  display: flex; align-items: center; justify-content: center; padding: 84px 92px;
  opacity: 0; transition: opacity .3s ease;
}
.lb.up { opacity: 1; }
.lb[hidden] { display: none; }
.lb-fig {
  margin: 0; display: flex; flex-direction: column; align-items: center; gap: 20px;
  max-width: 100%; max-height: 100%;
}
.lb-fig img {
  max-width: 100%; max-height: 74vh; width: auto; height: auto;
  object-fit: contain; box-shadow: 0 50px 110px -40px rgba(0, 0, 0, .9);
  transition: opacity .22s ease;
}
.lb-fig img.swap { opacity: 0; }
.lb-cap { text-align: center; display: grid; gap: 7px; }
.lb-cap .set {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent);
}
.lb-cap .txt {
  font-family: var(--display); font-weight: 400; font-size: 18px;
  letter-spacing: -.005em; color: #fff;
}
.lb-btn {
  position: absolute; display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, .26); background: rgba(255, 255, 255, .05);
  color: #fff; cursor: pointer; border-radius: 999px;
  transition: background .25s ease, border-color .25s ease, transform .25s ease;
}
.lb-btn:hover { background: rgba(255, 255, 255, .16); border-color: rgba(255, 255, 255, .6); }
.lb-btn[hidden] { display: none; }
.lb-x {
  top: 26px; right: 30px; height: 40px; padding: 0 18px; gap: 9px;
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em;
}
.lb-nav { top: 50%; width: 52px; height: 52px; margin-top: -26px; font-size: 17px; }
.lb-nav:hover { transform: scale(1.06); }
.lb-prev { left: 26px; }
.lb-next { right: 26px; }
.lb-count {
  position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%);
  font-family: var(--mono); font-size: 11px; letter-spacing: .16em;
  color: rgba(255, 255, 255, .55); font-variant-numeric: tabular-nums;
}
.lb-count b { color: #fff; font-weight: 500; }
.lb-hint {
  position: absolute; left: 30px; bottom: 30px;
  font-family: var(--mono); font-size: 10px; letter-spacing: .12em;
  text-transform: uppercase; color: rgba(255, 255, 255, .34);
}
body.locked { overflow: hidden; }

/* ---- Footer ---- */
.foot { border-top: 1px solid var(--line); }
.foot-inner {
  max-width: 1320px; margin: 0 auto; padding: 34px;
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;
  font-family: var(--mono); font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--ink-faint);
}

/* ---- Responsive ---- */
@media (max-width: 1080px) { .gallery { column-count: 2; } }
@media (max-width: 900px) {
  .shell, .topbar-inner, .body-grid, .foot-inner { padding-left: 22px; padding-right: 22px; }
  .body-grid { grid-template-columns: 1fr; gap: 0; }
  .rail { display: none; }
  .hero { padding: 58px 0 40px; }
  .hero-row { grid-template-columns: 1fr; gap: 34px; align-items: start; }
  .hero-side { flex-direction: row; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; }
  section.set { padding-top: 68px; }
  .lb { padding: 76px 16px 92px; }
  .lb-nav { width: 44px; height: 44px; margin-top: -22px; }
  .lb-prev { left: 12px; }
  .lb-next { right: 12px; }
  .lb-hint { display: none; }
  .lb-fig img { max-height: 66vh; }
}
@media (max-width: 560px) {
  .figures { gap: 28px; }
  .figure-num { font-size: 33px; }
  .gallery { column-count: 2; }
  .piece figcaption { font-size: 9.5px; padding: 24px 9px 9px; }
}
"""

JS = """
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Light / dark ----
     No stamp means "follow the viewer's system setting", which is the default.
     The toggle stamps an explicit choice and remembers it where it can. */
  var root = document.documentElement;
  var KEY = 'illume-theme';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (err) { stored = null; }
  if (stored === 'dark' || stored === 'light') root.setAttribute('data-theme', stored);

  function dark() {
    var stamp = root.getAttribute('data-theme');
    if (stamp) return stamp === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  document.getElementById('theme').addEventListener('click', function () {
    var next = dark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (err) { /* private mode; fine */ }
  });

  /* Reveal pieces as they arrive. */
  var pieces = [].slice.call(document.querySelectorAll('.piece'));
  if (reduce || !('IntersectionObserver' in window)) {
    pieces.forEach(function (p) { p.classList.add('seen'); });
  } else {
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = pieces.indexOf(e.target) % 3;
        setTimeout(function () { e.target.classList.add('seen'); }, i * 70);
        reveal.unobserve(e.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -40px 0px' });
    pieces.forEach(function (p) { reveal.observe(p); });
  }

  /* ---- Lightbox: one continuous slideshow across the whole portfolio ---- */
  var lb = document.getElementById('lb');
  var lbImg = document.getElementById('lbImg');
  var lbSet = document.getElementById('lbSet');
  var lbTxt = document.getElementById('lbTxt');
  var lbNow = document.getElementById('lbNow');
  var btnX = document.getElementById('lbX');
  var btnPrev = document.getElementById('lbPrev');
  var btnNext = document.getElementById('lbNext');
  var at = 0, lastFocus = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function show(i, animate) {
    at = (i + pieces.length) % pieces.length;
    var p = pieces[at];
    var img = p.querySelector('img');
    var apply = function () {
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lbSet.textContent = p.getAttribute('data-set');
      lbTxt.textContent = p.getAttribute('data-caption');
      lbNow.textContent = pad(at + 1);
      lbImg.classList.remove('swap');
    };
    if (animate && !reduce) {
      lbImg.classList.add('swap');
      setTimeout(apply, 130);
    } else {
      apply();
    }
    /* Warm the neighbours so stepping through feels instant. */
    [-1, 1].forEach(function (d) {
      var n = pieces[(at + d + pieces.length) % pieces.length].querySelector('img');
      var pre = new Image();
      pre.src = n.src;
    });
  }

  function open(i) {
    lastFocus = document.activeElement;
    show(i, false);
    lb.hidden = false;
    document.body.classList.add('locked');
    requestAnimationFrame(function () { lb.classList.add('up'); });
    btnX.focus();
  }

  function close() {
    lb.classList.remove('up');
    var done = function () {
      lb.hidden = true;
      lbImg.removeAttribute('src');
      document.body.classList.remove('locked');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    reduce ? done() : setTimeout(done, 260);
  }

  function step(d) { show(at + d, true); }

  pieces.forEach(function (p, i) {
    p.addEventListener('click', function () { open(i); });
    p.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open(i);
    });
  });

  document.getElementById('play').addEventListener('click', function () { open(0); });
  btnX.addEventListener('click', close);
  btnPrev.addEventListener('click', function () { step(-1); });
  btnNext.addEventListener('click', function () { step(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowLeft') { step(-1); return; }
    if (e.key === 'ArrowRight') { step(1); return; }
    if (e.key !== 'Tab') return;
    var stops = [btnX, btnPrev, btnNext];
    var i = stops.indexOf(document.activeElement);
    e.preventDefault();
    stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
  });

  /* Swipe, for reading it on a phone. */
  var x0 = null, y0 = null;
  lb.addEventListener('touchstart', function (e) {
    x0 = e.changedTouches[0].clientX;
    y0 = e.changedTouches[0].clientY;
  }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    x0 = y0 = null;
  }, { passive: true });

  /* ---- Section tracking + scroll progress ---- */
  var sets = [].slice.call(document.querySelectorAll('section.set'));
  var pillEls = [].slice.call(document.querySelectorAll('.pill'));
  var railEls = [].slice.call(document.querySelectorAll('.rail li'));
  var bar = document.getElementById('progress');
  var current = null;

  function mark(id) {
    if (id === current) return;
    current = id;
    pillEls.forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-for') === id); });
    railEls.forEach(function (l) { l.classList.toggle('on', l.getAttribute('data-for') === id); });
    var live = document.querySelector('.pill.on');
    if (live && live.scrollIntoView) live.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
      var line = window.innerHeight * 0.34, best = sets[0];
      sets.forEach(function (s) { if (s.getBoundingClientRect().top <= line) best = s; });
      mark(best.id);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
"""


# Stamp a remembered theme choice before first paint, so a viewer who chose
# dark doesn't get a white flash on the way in.
BOOT = ("<script>try{var t=localStorage.getItem('illume-theme');"
        "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}"
        "catch(e){}</script>")


def dims(name):
    with Image.open(IMAGES / name) as im:
        return im.size


def data_uri(name):
    return "data:image/jpeg;base64," + base64.b64encode((IMAGES / name).read_bytes()).decode()


def markup(inline):
    e = html.escape
    piece_no = 0
    pills, rail, sets = [], [], []

    for n, sec in enumerate(SECTIONS, 1):
        idx = f"{n:02d}"
        pills.append(
            f'<a class="pill" data-for="{sec["id"]}" href="#{sec["id"]}">'
            f'<i>{idx}</i>{e(sec["title"])}</a>'
        )
        rail.append(
            f'<li data-for="{sec["id"]}"><a href="#{sec["id"]}">'
            f'<span class="n">{idx}</span><span class="t">{e(sec["title"])}</span></a></li>'
        )

        tiles = []
        for f, cap in sec["items"]:
            piece_no += 1
            w, h = dims(f)
            src = data_uri(f) if inline else f"images/{f}"
            tiles.append(
                f'<figure class="piece" tabindex="0" role="button" '
                f'aria-label="View {e(cap)} full size" '
                f'data-set="{e(sec["title"])}" data-caption="{e(cap)}">'
                f'<img src="{src}" alt="{e(cap)}" width="{w}" height="{h}" '
                f'loading="lazy" decoding="async">'
                f'<figcaption><span>{e(cap)}</span>'
                f'<span class="idx">{piece_no:02d}</span></figcaption></figure>'
            )

        sets.append(
            f'<section class="set" id="{sec["id"]}">'
            f'<div class="set-head">'
            f'<div class="set-index">{idx} / {len(SECTIONS):02d}</div>'
            f'<h2>{e(sec["title"])}</h2><p>{e(sec["blurb"])}</p></div>'
            f'<div class="gallery">{"".join(tiles)}</div></section>'
        )

    chips = "".join(f"<span>{e(d)}</span>" for d in DISCIPLINES)

    return f"""<header class="topbar">
<div class="topbar-inner">
<div class="wordmark">ILLUME<span class="dot">.</span></div>
<nav class="pills" aria-label="Sections">{"".join(pills)}</nav>
<button class="theme" type="button" id="theme" aria-label="Switch between light and dark">
<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></svg>
<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>
</button>
</div>
<div class="progress" id="progress"></div>
</header>

<div class="shell">
<div class="hero">
<span class="kicker">Illume — Creative Studio</span>
<h1>Selected work, <em>studio&nbsp;quality</em>, made to show what we can do.</h1>
<div class="hero-row">
<div class="hero-copy">
<p>A showcase of what comes out of the studio — product photography, campaign creative,
brand identity, social content and film, across food and drink, beauty, retail and
hospitality. Every piece here is our own, made to show the range and the finish.</p>
<div class="disciplines">{chips}</div>
<p class="footnote">{e(FOOTNOTE)}</p>
</div>
<div class="hero-side">
<div class="figures">
<div><span class="figure-num">{TOTAL}</span><span class="figure-label">Pieces shown</span></div>
<div><span class="figure-num">{len(SECTIONS):02d}</span><span class="figure-label">Categories</span></div>
</div>
<button class="play" type="button" id="play"><span class="tri"></span>View as slideshow</button>
</div>
</div>
</div>
</div>

<div class="body-grid">
<aside class="rail">
<div class="rail-title">On this page</div>
<ol>{"".join(rail)}</ol>
</aside>
<main class="work">{"".join(sets)}</main>
</div>

<footer class="foot">
<div class="foot-inner"><span>Illume — Creative Studio</span><span>Selected work, {TOTAL} pieces</span></div>
</footer>

<div class="lb" id="lb" hidden role="dialog" aria-modal="true" aria-label="Portfolio viewer">
<button class="lb-btn lb-x" type="button" id="lbX">Close &#10005;</button>
<button class="lb-btn lb-nav lb-prev" type="button" id="lbPrev" aria-label="Previous piece">&#8592;</button>
<button class="lb-btn lb-nav lb-next" type="button" id="lbNext" aria-label="Next piece">&#8594;</button>
<figure class="lb-fig">
<img id="lbImg" alt="">
<figcaption class="lb-cap"><span class="set" id="lbSet"></span><span class="txt" id="lbTxt"></span></figcaption>
</figure>
<p class="lb-hint">&#8592; &#8594; to browse &middot; Esc to close</p>
<p class="lb-count"><b id="lbNow">01</b> / {TOTAL}</p>
</div>"""


def build(standalone=None):
    """Write index.html; optionally also a one-file copy at `standalone`."""
    title = "Illume Selected Work"

    page = markup(inline=False)
    (HERE / "index.html").write_text(
        f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="Selected work from Illume — {TOTAL} pieces across {len(SECTIONS)} categories.">
{FONTS}
<style>{CSS}</style>
{BOOT}
</head>
<body>
{page}
<script>{JS}</script>
</body>
</html>
"""
    )

    print(f"index.html          {(HERE / 'index.html').stat().st_size / 1024:8.1f} KB")

    # Optional: a single self-contained copy with the images inlined, for
    # sharing as one file. Written only when a path is asked for, so running
    # this inside the site repo never drops stray files next to the site.
    if standalone:
        art = pathlib.Path(standalone)
        art.write_text(
            f"<title>{title}</title>\n{FONTS}\n<style>{CSS}</style>\n{BOOT}\n"
            f"{markup(inline=True)}\n<script>{JS}</script>\n"
        )
        print(f"standalone copy     {art.stat().st_size / 1048576:8.2f} MB  {art}")

    print(f"pieces              {TOTAL} across {len(SECTIONS)} sections")


if __name__ == "__main__":
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else None)
