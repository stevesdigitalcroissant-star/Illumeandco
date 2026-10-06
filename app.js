/* Calorie Coach — everything runs in the browser; data is kept on this device (localStorage). */
(() => {
  "use strict";

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const r0 = (n) => Math.round(n || 0);
  const r1 = (n) => Math.round((n || 0) * 10) / 10;
  const fmt = (n) => r0(n).toLocaleString();
  const fmtG = (n) => (n < 10 ? r1(n) : r0(n)).toLocaleString();
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const todayKey = () => keyOf(new Date());
  const NUTS = ["kcal", "p", "c", "f", "fib", "sug", "na", "satf"];
  const zero = () => Object.fromEntries(NUTS.map((k) => [k, 0]));
  const scale = (src, m) => Object.fromEntries(NUTS.map((k) => [k, (src[k] || 0) * m]));
  const sum = (items) => items.reduce((t, it) => { NUTS.forEach((k) => (t[k] += it[k] || 0)); return t; }, zero());
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const FOODS = window.FOODS || [];
  const RECIPES = window.RECIPES || [];
  const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));
  const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

  // ---------- reference data ----------
  const MEALS = [
    { id: "breakfast", label: "Breakfast", share: 0.25 },
    { id: "lunch", label: "Lunch", share: 0.33 },
    { id: "dinner", label: "Dinner", share: 0.32 },
    { id: "snack", label: "Snacks", share: 0.1 },
  ];
  const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.id, m.label]));
  const ACTIVITY = [
    { f: 1.2, label: "Mostly sitting", hint: "Desk job, little exercise" },
    { f: 1.375, label: "Lightly active", hint: "Walks, exercise 1–3 days a week" },
    { f: 1.55, label: "Active", hint: "Exercise 3–5 days a week" },
    { f: 1.725, label: "Very active", hint: "Hard exercise 6–7 days a week" },
    { f: 1.9, label: "Athlete / physical job", hint: "Training twice a day or manual labor" },
  ];
  const CONDITIONS = [
    { id: "diabetes", label: "Type 2 diabetes", short: "diabetes" },
    { id: "bp", label: "High blood pressure", short: "high blood pressure" },
    { id: "heart", label: "Heart disease", short: "heart disease" },
    { id: "chol", label: "High cholesterol", short: "high cholesterol" },
    { id: "stroke", label: "Stroke", short: "stroke" },
    { id: "kidney", label: "Kidney disease", short: "kidney disease" },
  ];
  const DISLIKES = [
    ["chicken", "Chicken"], ["beef", "Beef"], ["pork", "Pork"], ["lamb", "Lamb"], ["turkey", "Turkey"],
    ["fish", "Fish"], ["shellfish", "Shellfish"], ["egg", "Eggs"], ["dairy", "Dairy"], ["gluten", "Gluten"],
    ["soy", "Soy / tofu"], ["nuts", "Tree nuts"], ["peanuts", "Peanuts"], ["sesame", "Sesame"], ["mushrooms", "Mushrooms"],
    ["onion", "Onion"], ["garlic", "Garlic"], ["tomato", "Tomato"], ["spicy", "Spicy food"], ["coconut", "Coconut"],
    ["avocado", "Avocado"], ["beans", "Beans"], ["cilantro", "Cilantro"], ["olives", "Olives"], ["eggplant", "Eggplant"], ["bell-pepper", "Bell pepper"],
  ];
  const COOK = {
    none: { emoji: "🥪", label: "I don't like to cook", hint: "Quick, simple meals — 15 minutes or less, few ingredients", levels: ["easy"] },
    some: { emoji: "🍳", label: "I cook sometimes", hint: "Easy weeknight cooking, 20–40 minutes", levels: ["easy", "medium"] },
    love: { emoji: "👩‍🍳", label: "I love to cook", hint: "Bigger recipes with real technique — worth the time", levels: ["medium", "chef"] },
  };
  const LEVEL_LABEL = { easy: "Easy", medium: "Home cooking", chef: "Chef project" };
  const MOODS = { easy: ["easy"], usual: null, cook: ["medium", "chef"] };

  // ---------- storage ----------
  const KEY = "calorie-coach.v1";
  const blank = () => ({ profile: null, logs: {}, plans: {}, recents: [], custom: [], lastQty: {}, celebrated: {}, dismissed: {} });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast("Couldn't save — storage is full or blocked"); } };
  const dayLog = (k) => (S.logs[k] ||= { items: [], water: 0 });
  const hasLog = (k) => (S.logs[k]?.items?.length || 0) > 0;

  // ---------- streaks, emoji & celebrations ----------
  const CAT_EMOJI = {
    Fruit: "🍎", Vegetables: "🥦", Protein: "🍗", "Dairy & Eggs": "🥚", "Grains & Bread": "🍞", "Legumes & Nuts": "🥜",
    Drinks: "🥤", "Snacks & Sweets": "🍪", "Fast Food": "🍔", "Prepared Meals": "🍲", "Condiments & Sauces": "🧂", "Fats & Oils": "🫒",
    Recipes: "🍽️", "My foods": "⭐",
  };
  const emojiOf = (id) => !id ? "🍴" : id.startsWith("r:") ? "🍽️" : id.startsWith("c:") ? "⭐" : CAT_EMOJI[FOOD_BY_ID.get(id)?.cat] || "🍴";

  function streakInfo() {
    let k = todayKey();
    if (!hasLog(k)) k = addDays(k, -1);
    let n = 0;
    while (hasLog(k)) { n++; k = addDays(k, -1); }
    return { n, start: addDays(k, 1) };
  }
  function bestStreak() {
    const keys = Object.keys(S.logs).filter(hasLog).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; }
    return best;
  }

  const MILESTONES = [3, 7, 14, 30, 60, 100];
  // Returns a celebration message the first time something worth cheering happens, else null.
  function celebration(k, added) {
    const C = (S.celebrated ||= {});
    let msg = null;
    if (!C.first) {
      C.first = 1;
      const total = Object.values(S.logs).reduce((n, l) => n + (l.items?.length || 0), 0);
      if (total <= added) msg = "🎉 Your very first log! The hardest step is done.";
    }
    const st = streakInfo();
    if (!msg && MILESTONES.includes(st.n) && !C[`streak${st.n}:${st.start}`]) { C[`streak${st.n}:${st.start}`] = 1; msg = `🔥 ${st.n}-day streak! You're on a roll.`; }
    const target = targets(S.profile).kcal, kc = dayTotals(k).kcal;
    if (!msg && kc >= target * 0.9 && kc <= target * 1.05 && !C["target:" + k]) { C["target:" + k] = 1; msg = "🎯 Right in your target zone today. Lovely."; }
    save();
    return msg;
  }

  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("canvas"), x = c.getContext("2d");
    if (!x) return;
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    c.className = "confetti"; c.width = W * dpr; c.height = H * dpr;
    document.body.appendChild(c);
    x.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const cols = ["--kcal", "--protein", "--carbs", "--fat", "--accent"].map((v) => cs.getPropertyValue(v).trim() || "#e0703a");
    const ps = Array.from({ length: 90 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.38, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
      r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 5, h: 4 + Math.random() * 4, c: cols[(Math.random() * cols.length) | 0],
    }));
    const t0 = performance.now(), LIFE = 1900;
    const frame = (now) => {
      const t = now - t0;
      x.clearRect(0, 0, W, H);
      x.globalAlpha = clamp(1 - t / LIFE, 0, 1);
      for (const p of ps) {
        p.vy += 0.35; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
      }
      if (t < LIFE) requestAnimationFrame(frame); else c.remove();
    };
    requestAnimationFrame(frame);
  }

  // After anything is logged: cheer if it's a milestone, otherwise a normal toast. Both can carry Undo.
  function afterLog(k, msg, ids) {
    const undo = ids?.length && { label: "Undo", fn: () => { const l = dayLog(k); l.items = l.items.filter((i) => !ids.includes(i.id)); save(); render(); toast("Undone"); } };
    const cheer = celebration(k, ids?.length || 1);
    if (cheer) confetti();
    toast(cheer || msg, undo);
  }

  // ---------- nutrition engine ----------
  const risk = (p, id) => ({ none: 0, family: 1, me: 2 }[p?.conditions?.[id] || "none"]);
  const anyRisk = (p, ids) => Math.max(0, ...ids.map((i) => risk(p, i)));

  function targets(p) {
    const w = p.weightKg, h = p.heightCm, a = p.age;
    const sexAdj = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
    const bmr = 10 * w + 6.25 * h - 5 * a + sexAdj;
    const tdee = bmr * ACTIVITY[p.activity ?? 1].f;
    let kcal = tdee;
    if (p.goal === "lose") kcal -= (p.pace || 1) * 500;
    if (p.goal === "gain") kcal += 300;
    const floor = p.sex === "male" ? 1500 : 1200;
    const floored = kcal < floor;
    kcal = Math.round(Math.max(kcal, floor) / 10) * 10;

    // Protein from a reference weight (caps at a BMI-25 weight so it stays realistic for larger bodies)
    const refW = Math.min(w, 25 * (h / 100) ** 2);
    let perKg = p.goal === "maintain" ? 1.2 : 1.6;
    if (risk(p, "kidney") === 2) perKg = 0.8;
    const prot = Math.round(refW * perKg);
    let fatPct = 0.3;
    let carbG = (kcal - prot * 4 - kcal * fatPct) / 4;
    const dm = risk(p, "diabetes");
    if (dm) {
      const cap = (kcal * (dm === 2 ? 0.4 : 0.45)) / 4;
      if (carbG > cap) { fatPct = Math.min(0.35, fatPct + ((carbG - cap) * 4) / kcal); carbG = (kcal - prot * 4 - kcal * fatPct) / 4; }
    }
    const fat = Math.round((kcal * fatPct) / 9);
    const carbs = Math.round(carbG);
    const fiber = Math.round(Math.max(p.sex === "male" ? 30 : 25, (kcal / 1000) * 14));
    const sugPct = dm === 2 ? 0.06 : dm === 1 ? 0.08 : 0.1;
    const sugar = Math.round((kcal * sugPct) / 4);
    const naRisk = anyRisk(p, ["bp", "heart", "stroke", "kidney"]);
    const sodium = naRisk === 2 ? 1500 : naRisk === 1 ? 2000 : 2300;
    const satRisk = anyRisk(p, ["heart", "chol", "stroke"]);
    const satPct = satRisk === 2 ? 0.06 : satRisk === 1 ? 0.08 : 0.1;
    const satf = Math.round((kcal * satPct) / 9);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, p: prot, c: carbs, f: fat, fib: fiber, sug: sugar, na: sodium, satf, floored, dm, naRisk, satRisk };
  }

  function targetReasons(p, t) {
    const out = [];
    out.push(`Your body burns about <b>${fmt(t.tdee)} kcal</b> a day at your activity level (resting: ${fmt(t.bmr)}).`);
    if (p.goal === "lose") out.push(`To lose about ${p.pace || 1} lb a week, you eat ${fmt((p.pace || 1) * 500)} kcal less than that.`);
    if (p.goal === "gain") out.push("To gain slowly, you eat about 300 kcal more than that.");
    if (t.floored) out.push(`Your target is held at ${fmt(t.kcal)} kcal — going lower isn't safe without a doctor.`);
    if (t.dm) out.push(`Because of ${t.dm === 2 ? "your" : "your family's"} diabetes, carbs are kept lower (about ${Math.round((t.c * 4 * 100) / t.kcal)}% of calories), sugar is capped at ${t.sug} g and fiber is set to ${t.fib} g to keep blood sugar steady.`);
    if (t.naRisk) out.push(`Sodium is limited to ${fmt(t.na)} mg because of ${t.naRisk === 2 ? "your" : "family"} history of ${CONDITIONS.filter((c) => ["bp", "heart", "stroke", "kidney"].includes(c.id) && risk(p, c.id)).map((c) => c.short).join(", ")}.`);
    if (t.satRisk) out.push(`Saturated fat is limited to ${t.satf} g to protect your heart and cholesterol.`);
    if (risk(p, "kidney") === 2) out.push("Protein is kept moderate for kidney health. Please confirm these numbers with your doctor.");
    return out;
  }

  // ---------- recipe matching ----------
  function excludedBy(p, r) {
    const dis = new Set(p.dislikes || []);
    if (r.contains.some((c) => dis.has(c))) return true;
    if (p.diet === "vegan" && !r.tags.includes("vegan")) return true;
    if (p.diet === "vegetarian" && !(r.tags.includes("vegetarian") || r.tags.includes("vegan"))) return true;
    if (p.diet === "pescatarian" && r.contains.some((c) => ["chicken", "beef", "pork", "lamb", "turkey"].includes(c))) return true;
    const words = (p.dislikeText || "").toLowerCase().split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.length > 2);
    if (words.length) {
      const hay = (r.name + " " + r.ingredients.join(" ")).toLowerCase();
      if (words.some((w) => hay.includes(w))) return true;
    }
    return false;
  }

  function portionFor(r, target) {
    return clamp(Math.round((target / r.kcal) * 4) / 4, 0.5, 2);
  }

  function scoreRecipe(p, r, target) {
    let s = -Math.abs(Math.log(target / r.kcal)) * 3;
    const dm = risk(p, "diabetes");
    if (dm) s += dm * ((r.tags.includes("diabetes-friendly") ? 1.2 : 0) - (r.c > 60 ? 1 : 0) - (r.sug > 20 ? 1 : 0));
    const na = anyRisk(p, ["bp", "heart", "stroke", "kidney"]);
    if (na) s += na * ((r.tags.includes("low-sodium") ? 1 : 0) - (r.na > 800 ? 1.2 : 0));
    const sat = anyRisk(p, ["heart", "chol", "stroke"]);
    if (sat) s += sat * ((r.tags.includes("heart-healthy") ? 1 : 0) - (r.satf > 6 ? 1 : 0));
    if (p.goal === "lose") s += (r.tags.includes("high-protein") ? 0.5 : 0) + (r.tags.includes("high-fiber") ? 0.4 : 0);
    return s;
  }

  function whyRecipe(p, r) {
    const why = [];
    if (risk(p, "diabetes") && r.tags.includes("diabetes-friendly")) why.push(`Blood-sugar friendly: ${r0(r.c)} g carbs, ${r0(r.fib)} g fiber`);
    if (anyRisk(p, ["bp", "heart", "stroke", "kidney"]) && r.na <= 600) why.push(`Low in sodium (${fmt(r.na)} mg)`);
    if (anyRisk(p, ["heart", "chol", "stroke"]) && r.tags.includes("heart-healthy")) why.push("Heart-healthy fats");
    if (r.tags.includes("high-protein")) why.push(`${r0(r.p)} g protein keeps you full`);
    if (p.cook === "none" && r.level === "easy") why.push(`Ready in ${r.mins} min, ${r.ingredients.length} ingredients`);
    if (p.cook === "love" && r.level === "chef") why.push("A proper cooking project");
    return why.slice(0, 3);
  }

  function candidates(p, slot, levels) {
    const allowed = levels || COOK[p.cook || "some"].levels;
    let list = RECIPES.filter((r) => r.meal.includes(slot) && !excludedBy(p, r));
    let lv = list.filter((r) => allowed.includes(r.level) || (slot === "snack" && r.level === "easy"));
    if (lv.length < 2) lv = list; // fall back rather than show nothing
    return lv;
  }

  function buildPlan(dateKey, mood = "usual", spins = {}) {
    const p = S.profile, t = targets(p);
    const levels = MOODS[mood];
    const used = new Set();
    const plan = { mood, spins, slots: {} };
    for (const m of MEALS) {
      const target = t.kcal * m.share;
      const rand = rng(hash(dateKey + m.id));
      const ranked = candidates(p, m.id, levels)
        .map((r) => ({ r, s: scoreRecipe(p, r, target) + rand() * 1.6 }))
        .sort((a, b) => b.s - a.s)
        .filter((x) => !used.has(x.r.id));
      if (!ranked.length) continue;
      const pick = ranked[(spins[m.id] || 0) % Math.min(ranked.length, 12)].r;
      used.add(pick.id);
      plan.slots[m.id] = { id: pick.id, m: portionFor(pick, target), target: Math.round(target) };
    }
    return plan;
  }

  // ---------- UI state ----------
  const ui = { tab: "today", date: todayKey(), meal: guessMeal(), query: "", cat: "All", mealsMode: "plan", browseMeal: "all", browseLevel: "mine", browseQ: "", ob: 0, editStep: null };
  function guessMeal() { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : h < 21 ? "dinner" : "snack"; }

  let toastTimer, toastAction = null;
  function toast(msg, action) {
    const t = $("#toast");
    toastAction = action || null;
    t.innerHTML = `<span class="msg">${esc(msg)}</span>${action ? `<button data-act="toast-act">${esc(action.label)}</button>` : ""}`;
    t.classList.toggle("has-act", !!action);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); toastAction = null; }, action ? 5000 : 2400);
  }
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  const CHEER = {
    empty: ["Every day's a fresh page. Log the first thing you eat.", "No pressure — just log what you remember.", "One tap is all it takes to get going.", "Start small: what was the last thing you ate?"],
    going: ["Logging is the hard part — you're doing it.", "Small steps add up. Nice one.", "You showed up today. That counts.", "Progress, not perfection.", "Every bite you log teaches you something.", "You're getting the hang of this.", "Look at you, keeping track. Proud of you."],
    zone: ["Right in the zone today. Lovely.", "Nicely balanced day so far.", "You're right where you wanted to be."],
    over: ["Bigger day? That's okay — one day doesn't define you.", "Still logging on a big day takes honesty. Respect.", "Every day is different. Tomorrow's a fresh start.", "Noticing is what matters, and you're noticing."],
  };

  const ICON = {
    left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    drop: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
  };

  // ---------- render root ----------
  function render() {
    const view = $("#view");
    const tabbar = $("#tabbar");
    if (!S.profile || ui.editStep !== null) {
      tabbar.hidden = true;
      view.className = "view no-tabs";
      view.innerHTML = renderOnboarding();
      return;
    }
    tabbar.hidden = false;
    view.className = "view";
    tabbar.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === ui.tab ? "page" : "false"));
    view.innerHTML = { today: renderToday, add: renderAdd, meals: renderMeals, insights: renderInsights, profile: renderProfile }[ui.tab]();
  }

  // ---------- onboarding ----------
  const OB_STEPS = ["welcome", "body", "goal", "health", "food", "cook", "result"];
  let draft = null;
  function obDraft() {
    if (!draft) draft = JSON.parse(JSON.stringify(S.profile || { name: "", units: "us", sex: "", age: "", heightCm: "", weightKg: "", activity: 1, goal: "lose", pace: 1, conditions: {}, diet: "any", dislikes: [], dislikeText: "", cook: "" }));
    return draft;
  }

  function renderOnboarding() {
    const d = obDraft();
    const editing = ui.editStep !== null;
    const step = editing ? ui.editStep : OB_STEPS[ui.ob];
    const us = d.units === "us";
    const ft = d.heightCm ? Math.floor(d.heightCm / 2.54 / 12) : "";
    const inch = d.heightCm ? Math.round(d.heightCm / 2.54 - ft * 12) : "";
    const lb = d.weightKg ? Math.round(d.weightKg * 2.20462) : "";
    const pressed = (v) => `aria-pressed="${v}"`;
    let body = "";

    if (step === "welcome") body = `
      <div class="stack" style="gap:14px">
        <div class="hero-num">Hi there.</div>
        <h1>Let's build a plan around <em>you</em>.</h1>
        <p class="muted">A few questions about your body, your family's health and how you like to eat. Everything stays on this phone.</p>
      </div>
      <label class="field">What should we call you?<input class="input" data-f="name" value="${esc(d.name)}" placeholder="Your first name" autocomplete="given-name"></label>
      <div class="row between"><span class="small muted">Units</span>
        <div class="seg"><button data-act="units" data-v="us" ${pressed(us)}>lb · ft</button><button data-act="units" data-v="metric" ${pressed(!us)}>kg · cm</button></div></div>`;

    if (step === "body") body = `
      <h1>About your body</h1>
      <p class="muted">Used to work out how much energy you burn each day.</p>
      <div class="stack"><span class="small muted" style="font-weight:600">Sex (for the calorie formula)</span>
        <div class="seg" style="align-self:flex-start">${["female", "male", "other"].map((s) => `<button data-act="pick" data-k="sex" data-v="${s}" ${pressed(d.sex === s)}>${s === "other" ? "Prefer not to say" : s[0].toUpperCase() + s.slice(1)}</button>`).join("")}</div></div>
      <label class="field">Age<input class="input" type="number" inputmode="numeric" data-f="age" value="${esc(d.age)}" placeholder="e.g. 34" min="13" max="100"></label>
      ${us ? `<div class="grid-2"><label class="field">Height (ft)<input class="input" type="number" inputmode="numeric" data-f="ft" value="${ft}" placeholder="5"></label><label class="field">Height (in)<input class="input" type="number" inputmode="numeric" data-f="in" value="${inch}" placeholder="8"></label></div>
             <label class="field">Weight (lb)<input class="input" type="number" inputmode="decimal" data-f="lb" value="${lb}" placeholder="170"></label>`
           : `<div class="grid-2"><label class="field">Height (cm)<input class="input" type="number" inputmode="numeric" data-f="cm" value="${d.heightCm ? r0(d.heightCm) : ""}" placeholder="172"></label><label class="field">Weight (kg)<input class="input" type="number" inputmode="decimal" data-f="kg" value="${d.weightKg ? r1(d.weightKg) : ""}" placeholder="77"></label></div>`}`;

    if (step === "goal") body = `
      <h1>Your day & your goal</h1>
      <div class="stack">${ACTIVITY.map((a, i) => `<button class="choice" data-act="pick" data-k="activity" data-v="${i}" ${pressed(d.activity === i)}><div><b>${a.label}</b><span>${a.hint}</span></div></button>`).join("")}</div>
      <div class="stack"><span class="small muted" style="font-weight:600">Goal</span>
        <div class="seg" style="align-self:flex-start">${[["lose", "Lose weight"], ["maintain", "Maintain"], ["gain", "Gain"]].map(([v, l]) => `<button data-act="pick" data-k="goal" data-v="${v}" ${pressed(d.goal === v)}>${l}</button>`).join("")}</div></div>
      ${d.goal === "lose" ? `<div class="stack"><span class="small muted" style="font-weight:600">How fast?</span>
        <div class="seg" style="align-self:flex-start">${[[0.5, "Gentle · ½ lb/wk"], [1, "Steady · 1 lb/wk"], [1.5, "Faster · 1½ lb/wk"]].map(([v, l]) => `<button data-act="pick" data-k="pace" data-v="${v}" ${pressed(d.pace === v)}>${l}</button>`).join("")}</div></div>` : ""}`;

    if (step === "health") body = `
      <h1>Health in your family</h1>
      <p class="muted">Tell us what runs in your family — or what you have yourself — and your limits for sugar, salt and fat will adjust to protect you.</p>
      <div class="card flat" style="padding:4px 14px">${CONDITIONS.map((c) => {
        const v = d.conditions[c.id] || "none";
        return `<div class="cond"><span style="font-weight:500">${c.label}</span><div class="seg">${[["none", "No"], ["family", "Family"], ["me", "Me"]].map(([k, l]) => `<button data-act="cond" data-id="${c.id}" data-v="${k}" ${pressed(v === k)}>${l}</button>`).join("")}</div></div>`;
      }).join("")}</div>
      <p class="small muted">This app gives general guidance, not medical advice. If you've been diagnosed, follow your doctor's or dietitian's plan first.</p>`;

    if (step === "food") body = `
      <h1>What you eat</h1>
      <div class="stack"><span class="small muted" style="font-weight:600">Eating style</span>
        <div class="chips">${[["any", "Everything"], ["pescatarian", "Pescatarian"], ["vegetarian", "Vegetarian"], ["vegan", "Vegan"]].map(([v, l]) => `<button class="chip" data-act="pick" data-k="diet" data-v="${v}" ${pressed(d.diet === v)}>${l}</button>`).join("")}</div></div>
      <div class="stack"><span class="small muted" style="font-weight:600">Foods you don't like or can't eat</span>
        <div class="chips">${DISLIKES.map(([v, l]) => `<button class="chip" data-act="dislike" data-v="${v}" ${pressed(d.dislikes.includes(v))}>${l}</button>`).join("")}</div></div>
      <label class="field">Anything else? (comma separated)<input class="input" data-f="dislikeText" value="${esc(d.dislikeText)}" placeholder="e.g. kale, salmon, raisins"></label>`;

    if (step === "cook") body = `
      <h1>How do you feel about cooking?</h1>
      <p class="muted">Your meal ideas will match. You can change your mood any day.</p>
      <div class="stack">${Object.entries(COOK).map(([k, c]) => `<button class="choice" data-act="pick" data-k="cook" data-v="${k}" ${pressed(d.cook === k)}><span class="emoji">${c.emoji}</span><div><b>${c.label}</b><span>${c.hint}</span></div></button>`).join("")}</div>`;

    if (step === "result") {
      const t = targets(d);
      body = `
        <span class="small muted" style="font-weight:600">Your daily target${d.name ? ", " + esc(d.name) : ""}</span>
        <div class="row" style="align-items:baseline;gap:8px"><span class="hero-num">${fmt(t.kcal)}</span><span class="muted">kcal / day</span></div>
        <div class="nut-grid">
          <div class="nut"><b style="color:var(--protein)">${t.p} g</b><span>Protein</span></div>
          <div class="nut"><b style="color:var(--carbs)">${t.c} g</b><span>Carbs</span></div>
          <div class="nut"><b style="color:var(--fat)">${t.f} g</b><span>Fat</span></div>
          <div class="nut"><b>${t.fib} g</b><span>Fiber (min)</span></div>
        </div>
        <div class="card flat stack">${targetReasons(d, t).map((x) => `<p class="small">${x}</p>`).join("")}</div>`;
    }

    const valid = stepValid(step, d);
    const nav = editing
      ? `<div class="row"><button class="btn ghost" data-act="ob-cancel">Cancel</button><button class="btn primary grow" data-act="ob-save" ${valid ? "" : "disabled"}>Save</button></div>`
      : `<div class="row">${ui.ob > 0 ? `<button class="btn ghost" data-act="ob-back">Back</button>` : ""}<button class="btn primary grow" data-act="ob-next" ${valid ? "" : "disabled"}>${step === "result" ? "Start tracking" : "Continue"}</button></div>`;
    return `${editing ? "" : `<div class="progress">${OB_STEPS.map((_, i) => `<i class="${i <= ui.ob ? "on" : ""}"></i>`).join("")}</div>`}
      ${body}${nav}<p class="disclaimer">Not medical advice. Talk to your doctor before big changes to your diet.</p>`;
  }

  function stepValid(step, d) {
    if (step === "body") return d.sex && d.age >= 13 && d.age <= 100 && d.heightCm >= 120 && d.heightCm <= 230 && d.weightKg >= 30 && d.weightKg <= 350;
    if (step === "cook") return !!d.cook;
    return true;
  }

  function obInput(el) {
    const d = obDraft(), f = el.dataset.f, v = el.value;
    if (f === "name" || f === "dislikeText") d[f] = v;
    if (f === "age") d.age = Number(v) || "";
    if (f === "ft" || f === "in") {
      const ftv = Number($('[data-f="ft"]').value) || 0, inv = Number($('[data-f="in"]').value) || 0;
      d.heightCm = ftv || inv ? (ftv * 12 + inv) * 2.54 : "";
    }
    if (f === "lb") d.weightKg = Number(v) ? Number(v) / 2.20462 : "";
    if (f === "cm") d.heightCm = Number(v) || "";
    if (f === "kg") d.weightKg = Number(v) || "";
    const step = ui.editStep ?? OB_STEPS[ui.ob];
    const btn = $('[data-act="ob-next"],[data-act="ob-save"]');
    if (btn) btn.disabled = !stepValid(step, d);
  }

  // ---------- Today ----------
  function dayTotals(k) { return sum(S.logs[k]?.items || []); }

  function renderToday() {
    const p = S.profile, t = targets(p), k = ui.date, log = S.logs[k] || { items: [], water: 0 };
    const tot = sum(log.items);
    const left = t.kcal - tot.kcal;
    const pct = clamp(tot.kcal / t.kcal, 0, 1);
    const C = 2 * Math.PI * 42;
    const isToday = k === todayKey();
    const d = dateOf(k);
    const label = isToday ? "Today" : k === addDays(todayKey(), -1) ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long" });
    const macro = (name, key, color) => `<div class="macro"><div class="row between"><span>${name}</span><span class="num"><b>${fmt(tot[key])}</b> / ${t[key]} g</span></div><div class="bar"><i style="width:${clamp((tot[key] / t[key]) * 100, 0, 100)}%;background:${color}"></i></div></div>`;
    const watch = (name, key, unit, kind) => {
      const ratio = tot[key] / t[key];
      const color = kind === "min" ? (ratio >= 1 ? "var(--good)" : "var(--accent)") : ratio > 1 ? "var(--bad)" : ratio > 0.85 ? "var(--warn)" : "var(--good)";
      return `<div><div class="lbl"><span>${name}</span><b class="num">${fmt(tot[key])}/${fmt(t[key])}${unit}</b></div><div class="bar"><i style="width:${clamp(ratio * 100, 0, 100)}%;background:${color}"></i></div></div>`;
    };
    const hour = new Date().getHours();
    const greet = p.name ? `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${esc(p.name)}` : "Your day";
    const streak = streakInfo().n;
    const ratio = tot.kcal / t.kcal;
    const pool = !log.items.length ? CHEER.empty : ratio > 1.05 ? CHEER.over : ratio >= 0.9 ? CHEER.zone : CHEER.going;
    const cheer = pool[hash(k + pool[0]) % pool.length];
    const yItems = S.logs[addDays(k, -1)]?.items || [];
    const quickMeal = guessMeal();
    const quick = isToday ? S.recents.map(lookupFood).filter(Boolean).slice(0, 8) : [];
    const nudge = isToday && !log.items.length && hour >= 11 && !S.dismissed?.["nudge:" + k];
    const installTip = !isStandalone() && !S.dismissed?.install;

    return `
      <header class="head"><div><div class="eyebrow">${isToday ? greet : d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</div>
        <div class="row" style="gap:10px"><h1>${label}</h1>${streak ? `<span class="streak" title="Days in a row with something logged">🔥 ${streak}-day streak</span>` : ""}</div></div>
        <div class="row"><button class="icon-btn" data-act="day" data-v="-1" aria-label="Previous day">${ICON.left}</button><button class="icon-btn" data-act="day" data-v="1" aria-label="Next day" ${isToday ? "disabled style='opacity:.35'" : ""}>${ICON.right}</button></div></header>

      ${nudge ? `<section class="card nudge stack">
        <div class="row between" style="align-items:flex-start"><div><h3>👋 Quick check-in</h3><p class="small muted" style="margin-top:2px">What did you have for breakfast? Even a rough guess helps.</p></div>
          <button class="icon-btn sm" data-act="dismiss" data-v="nudge:${k}" aria-label="Not now">${ICON.close}</button></div>
        <div class="row wrap"><button class="btn small primary" data-act="add-to" data-v="breakfast">${ICON.plus} Log breakfast</button><button class="btn small" data-act="add-to" data-v="lunch">Log lunch</button><button class="btn small ghost" data-act="dismiss" data-v="nudge:${k}">I skipped it</button></div>
      </section>` : ""}

      <section class="card">
        <div class="summary">
          <div class="ring"><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="42" stroke-width="10"/><circle class="val ${left < 0 ? "over" : ""}" cx="50" cy="50" r="42" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
            <div class="center"><span class="big num">${fmt(Math.abs(left))}</span><span class="tiny muted">${left < 0 ? "kcal over" : "kcal left"}</span></div></div>
          <div class="stack">
            <div class="row between small"><span class="muted">Eaten</span><b class="num">${fmt(tot.kcal)} kcal</b></div>
            <div class="row between small"><span class="muted">Target</span><b class="num">${fmt(t.kcal)} kcal</b></div>
            ${macro("Protein", "p", "var(--protein)")}${macro("Carbs", "c", "var(--carbs)")}${macro("Fat", "f", "var(--fat)")}
          </div>
        </div>
        <p class="cheer">${esc(cheer)}</p>
      </section>

      ${quick.length ? `<section class="stack" style="gap:8px">
        <div class="row between"><h3>Log again</h3><span class="tiny muted">one tap → ${MEAL_LABEL[quickMeal]}</span></div>
        <div class="chips scroll">${quick.map((f) => {
          const lq = S.lastQty?.[f.id] || { qty: 1 };
          return `<button class="chip qchip" data-act="quick" data-id="${esc(f.id)}"><span class="e">${emojiOf(f.id)}</span><span class="nm">${esc(f.name)}</span><span class="k">${fmt(f.kcal * lq.qty)}</span></button>`;
        }).join("")}</div>
      </section>` : ""}

      <section class="card">
        <div class="card-title"><h3>Watch list</h3><span class="tiny muted">Fiber is a goal · the rest are limits</span></div>
        <div class="watch">${watch("Fiber", "fib", " g", "min")}${watch("Sugar", "sug", " g", "max")}${watch("Sodium", "na", " mg", "max")}${watch("Sat. fat", "satf", " g", "max")}</div>
      </section>

      <section class="card">
        ${MEALS.map((m) => {
          const items = log.items.filter((i) => i.meal === m.id);
          const mt = sum(items);
          const yMeal = yItems.filter((i) => i.meal === m.id);
          return `<div class="meal-block"><div class="meal-head"><h3>${m.label} ${items.length ? `<span class="muted small num" style="font-weight:500">· ${fmt(mt.kcal)} kcal</span>` : ""}</h3>
            <button class="btn small ghost" data-act="add-to" data-v="${m.id}">${ICON.plus} Add</button></div>
            ${items.length ? items.map((i) => `<button class="item" data-act="edit-item" data-id="${i.id}"><span class="em">${emojiOf(i.foodId)}</span><div class="grow"><b>${esc(i.name)}</b><span class="tiny muted">${esc(i.label)} · P ${fmt(i.p)} · C ${fmt(i.c)} · F ${fmt(i.f)}</span></div><span class="kc">${fmt(i.kcal)}</span></button>`).join("")
              : yMeal.length ? `<button class="btn small same" data-act="same-yday" data-v="${m.id}">↻ Same as yesterday <span class="num muted">(${fmt(sum(yMeal).kcal)} kcal)</span></button>`
              : `<p class="empty">Nothing logged yet</p>`}</div>`;
        }).join("")}
      </section>

      <section class="card row between">
        <div class="row"><span style="color:var(--protein)">${ICON.drop.replace("<svg", '<svg width="22" height="22"')}</span><div><h3>Water</h3><span class="small muted num">${log.water || 0} of 8 glasses</span></div></div>
        <div class="row"><button class="icon-btn" data-act="water" data-v="-1" aria-label="Less water">${ICON.minus}</button><button class="icon-btn" data-act="water" data-v="1" aria-label="More water">${ICON.plus}</button></div>
      </section>

      ${installTip ? `<section class="card tipcard row" style="align-items:flex-start">
        <span class="em big">📲</span>
        <div class="grow"><h3>Add to your home screen</h3><p class="small muted" style="margin-top:2px">On iPhone, open this page in Safari, tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>. It opens like an app and works offline.</p></div>
        <button class="icon-btn sm" data-act="dismiss" data-v="install" aria-label="Dismiss tip">${ICON.close}</button>
      </section>` : ""}`;
  }

  // ---------- Add / search ----------
  const CATS = ["All", "My foods", "Recipes", ...new Set(FOODS.map((f) => f.cat))];

  function searchFoods(q, cat) {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const recipesAsFoods = RECIPES.map((r) => ({ ...r, id: "r:" + r.id, cat: "Recipes", serving: "1 serving", recipe: true }));
    const custom = S.custom.map((c) => ({ ...c, cat: "My foods" }));
    let pool = cat === "All" ? [...custom, ...FOODS, ...recipesAsFoods] : cat === "My foods" ? custom : cat === "Recipes" ? recipesAsFoods : FOODS.filter((f) => f.cat === cat);
    if (!toks.length) return pool.slice(0, cat === "All" ? 0 : 200);
    return pool
      .map((f) => {
        const n = f.name.toLowerCase();
        if (!toks.every((t) => n.includes(t) || f.cat.toLowerCase().includes(t))) return null;
        // Your own foods always rank first — they're the ones you actually eat.
        return { f, s: (n.startsWith(toks[0]) ? 0 : 1) + (f.recipe ? 0.5 : 0) + (f.cat === "My foods" ? -3 : 0) + n.length / 100 };
      })
      .filter(Boolean)
      .sort((a, b) => a.s - b.s)
      .slice(0, 60)
      .map((x) => x.f);
  }

  function lookupFood(id) {
    if (id.startsWith("r:")) { const r = RECIPE_BY_ID.get(id.slice(2)); return r && { ...r, id, serving: "1 serving", recipe: true }; }
    return FOOD_BY_ID.get(id) || S.custom.find((c) => c.id === id);
  }

  function resultRow(f) {
    return `<button class="result" data-act="pick-food" data-id="${esc(f.id)}"><span class="em">${emojiOf(f.id)}</span><div class="grow"><b style="font-weight:500">${esc(f.name)}</b><div class="tiny muted">${esc(f.serving)} · ${fmt(f.kcal)} kcal · P ${fmtG(f.p)} · C ${fmtG(f.c)} · F ${fmtG(f.f)}</div></div><span class="plus">${ICON.plus}</span></button>`;
  }

  function renderAdd() {
    const results = searchFoods(ui.query, ui.cat);
    const recents = S.recents.map(lookupFood).filter(Boolean).slice(0, 12);
    const showRecents = !ui.query && ui.cat === "All";
    return `
      <header class="head"><div><div class="eyebrow">${ui.date === todayKey() ? "Today" : dateOf(ui.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div><h1>Log food</h1></div></header>
      <div class="seg" style="align-self:flex-start">${MEALS.map((m) => `<button data-act="meal" data-v="${m.id}" aria-pressed="${ui.meal === m.id}">${m.label}</button>`).join("")}</div>

      <button class="scan" data-act="scan"><span class="ico">${ICON.camera}</span><div style="text-align:left"><b>Scan your plate</b><div class="small muted">Point your camera and see calories before you eat — coming soon</div></div></button>

      <div class="search">${ICON.search}<input class="input" id="q" type="search" placeholder="Search ${fmt(FOODS.length + RECIPES.length)} foods & recipes" value="${esc(ui.query)}" autocomplete="off" enterkeyhint="search"></div>
      <div class="chips scroll">${CATS.map((c) => `<button class="chip" data-act="cat" data-v="${esc(c)}" aria-pressed="${ui.cat === c}">${esc(c)}</button>`).join("")}</div>

      <section class="card" id="results" style="padding:4px 14px">
        ${showRecents
          ? recents.length ? `<div class="card-title" style="margin:10px 0 0"><h3>Recent</h3></div>${recents.map(resultRow).join("")}` : `<p class="empty" style="padding:14px 0">Search for something you ate, or pick a category.</p>`
          : results.length ? results.map(resultRow).join("")
          : ui.cat === "My foods" && !ui.query ? `<p class="empty" style="padding:14px 0">⭐ Foods you add yourself live here. Add one below and it's saved for next time.</p>`
          : `<div class="stack" style="padding:14px 0"><p class="empty">No match for “${esc(ui.query)}”. Add it once and it's yours forever.</p><button class="btn small primary" style="align-self:flex-start" data-act="custom">${ICON.plus} Add “${esc(ui.query)}”</button></div>`}
      </section>
      <button class="btn block" data-act="custom">${ICON.plus} Add your own food</button>`;
  }

  function updateResults() {
    const box = $("#results");
    if (!box) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = renderAdd();
    box.innerHTML = $("#results", tmp).innerHTML;
  }

  // ---------- sheets ----------
  function openSheet(html) {
    $("#sheet").innerHTML = `<div class="grab"></div>${html}`;
    $("#sheetWrap").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheet() { $("#sheetWrap").hidden = true; document.body.style.overflow = ""; sheetState = null; }
  let sheetState = null;

  function nutrientWarnings(n) {
    const t = targets(S.profile), out = [];
    if (n.na > t.na * 0.4) out.push(`${Math.round((n.na / t.na) * 100)}% of your daily sodium limit`);
    if (n.sug > t.sug * 0.5) out.push(`${Math.round((n.sug / t.sug) * 100)}% of your daily sugar limit`);
    if (n.satf > t.satf * 0.5) out.push(`${Math.round((n.satf / t.satf) * 100)}% of your saturated fat limit`);
    if (n.kcal > t.kcal * 0.5) out.push(`${Math.round((n.kcal / t.kcal) * 100)}% of your whole day's calories`);
    return out;
  }

  function nutritionBlock(n) {
    return `<div class="nut-grid">
        <div class="nut"><b style="color:var(--kcal)">${fmt(n.kcal)}</b><span>kcal</span></div>
        <div class="nut"><b style="color:var(--protein)">${fmtG(n.p)} g</b><span>Protein</span></div>
        <div class="nut"><b style="color:var(--carbs)">${fmtG(n.c)} g</b><span>Carbs</span></div>
        <div class="nut"><b style="color:var(--fat)">${fmtG(n.f)} g</b><span>Fat</span></div></div>
      <div class="grid-2 small">
        <div class="row between"><span class="muted">Fiber</span><b class="num">${fmtG(n.fib)} g</b></div>
        <div class="row between"><span class="muted">Sugar</span><b class="num">${fmtG(n.sug)} g</b></div>
        <div class="row between"><span class="muted">Sodium</span><b class="num">${fmt(n.na)} mg</b></div>
        <div class="row between"><span class="muted">Sat. fat</span><b class="num">${fmtG(n.satf)} g</b></div></div>`;
  }

  function foodSheet(food, existing) {
    sheetState = { food, existing, qty: existing ? existing.qty : 1, meal: existing ? existing.meal : ui.meal, mode: "serv" };
    drawFoodSheet();
  }
  function drawFoodSheet(keepFocus) {
    const st = sheetState, f = st.food;
    const n = scale(f, st.qty);
    const warn = nutrientWarnings(n);
    const grams = f.g ? r0(f.g * st.qty) : null;
    const html = `
      <div class="row between"><div class="grow"><h2>${esc(f.name)}</h2><p class="small muted">${esc(f.serving)}${f.recipe ? ` · ${LEVEL_LABEL[f.level]} · ${f.mins} min` : ""}${String(f.id).startsWith("c:") ? " · ⭐ My food" : ""}</p>
        ${String(f.id).startsWith("c:") && !st.existing ? `<button class="link" data-act="edit-food" data-id="${esc(f.id)}">Edit food</button>` : ""}
        ${f.orphan ? `<button class="link" data-act="save-as-mine">⭐ Save as my food</button>` : ""}</div><button class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
      <div class="row between">
        <div class="stepper"><button class="icon-btn" data-act="qty" data-v="-0.25" aria-label="Less">${ICON.minus}</button>
          <input class="input num" id="qty" type="number" inputmode="decimal" step="0.25" min="0.25" value="${st.mode === "g" ? grams : r1(st.qty * 100) / 100}">
          <button class="icon-btn" data-act="qty" data-v="0.25" aria-label="More">${ICON.plus}</button></div>
        ${f.g ? `<div class="seg"><button data-act="qmode" data-v="serv" aria-pressed="${st.mode === "serv"}">Servings</button><button data-act="qmode" data-v="g" aria-pressed="${st.mode === "g"}">Grams</button></div>` : `<span class="small muted">servings</span>`}
      </div>
      <div id="nutBox" class="stack">${nutritionBlock(n)}</div>
      <div id="warnBox">${warn.length ? `<div class="stack small" style="color:var(--warn)">${warn.map((w) => `<span>⚠︎ This is ${w}</span>`).join("")}</div>` : ""}</div>
      <div class="seg" style="align-self:flex-start">${MEALS.map((m) => `<button data-act="smeal" data-v="${m.id}" aria-pressed="${st.meal === m.id}">${m.label}</button>`).join("")}</div>
      <div class="row">${st.existing ? `<button class="btn danger" data-act="del-item">Remove</button>` : ""}<button class="btn primary grow" data-act="save-item">${st.existing ? "Save changes" : `Add to ${MEAL_LABEL[st.meal]}`}</button></div>`;
    if (keepFocus) {
      $("#nutBox").innerHTML = nutritionBlock(n);
      $("#warnBox").innerHTML = warn.length ? `<div class="stack small" style="color:var(--warn)">${warn.map((w) => `<span>⚠︎ This is ${w}</span>`).join("")}</div>` : "";
    } else openSheet(html);
  }

  const labelFor = (f, qty, mode) => (f.g && mode === "g" ? `${r0(f.g * qty)} g` : `${r1(qty * 100) / 100} × ${f.serving}`);
  const makeItem = (f, qty, meal, mode) => ({ id: uid(), foodId: f.id, name: f.name, meal, qty, label: labelFor(f, qty, mode), t: Date.now(), ...scale(f, qty) });
  function remember(f, qty, mode) {
    if (f.orphan) return;
    S.recents = [f.id, ...S.recents.filter((x) => x !== f.id)].slice(0, 30);
    (S.lastQty ||= {})[f.id] = { qty, mode: f.g ? mode : "serv" };
  }

  function saveItem() {
    const st = sheetState, f = st.food;
    if (!(st.qty > 0)) return toast("Enter an amount");
    let added = null;
    if (st.existing) Object.assign(st.existing, scale(f, st.qty), { qty: st.qty, meal: st.meal, label: labelFor(f, st.qty, st.mode) });
    else dayLog(ui.date).items.push((added = makeItem(f, st.qty, st.meal, st.mode)));
    remember(f, st.qty, st.mode);
    save();
    closeSheet();
    render();
    if (added) afterLog(ui.date, `Added to ${MEAL_LABEL[st.meal]}`, [added.id]);
    else toast("Updated");
  }

  function quickLog(id) {
    const f = lookupFood(id);
    if (!f) return;
    const lq = S.lastQty?.[f.id] || { qty: 1, mode: "serv" };
    const meal = ui.date === todayKey() ? guessMeal() : ui.meal;
    const it = makeItem(f, lq.qty, meal, lq.mode);
    dayLog(ui.date).items.push(it);
    remember(f, lq.qty, lq.mode);
    save();
    render();
    afterLog(ui.date, `${f.name} → ${MEAL_LABEL[meal]}`, [it.id]);
  }

  function sameAsYesterday(meal) {
    const prev = (S.logs[addDays(ui.date, -1)]?.items || []).filter((i) => i.meal === meal);
    if (!prev.length) return;
    const now = Date.now();
    const copies = prev.map((i, n) => ({ ...i, id: uid(), t: now + n }));
    dayLog(ui.date).items.push(...copies);
    save();
    render();
    afterLog(ui.date, `${MEAL_LABEL[meal]} copied from yesterday`, copies.map((c) => c.id));
  }

  // opts: { food: values to prefill, editId: custom food being edited, linkItem: logged item to attach the new food to }
  function customSheet(opts = {}) {
    const v = opts.food || {};
    sheetState = { custom: true, editId: opts.editId || null, linkItem: opts.linkItem || null };
    const val = (x) => (x === undefined || x === null || x === "" ? "" : esc(typeof x === "number" ? r1(x) : x));
    const num = (k, label) => `<label class="field">${label}<input class="input" id="c_${k}" type="number" inputmode="decimal" value="${val(v[k])}"></label>`;
    const title = opts.editId ? "Edit my food" : opts.linkItem ? "Save as my food" : "Add your own food";
    const cta = opts.editId ? "Save changes" : opts.linkItem ? "Save to My foods" : `Save & add to ${MEAL_LABEL[ui.meal]}`;
    openSheet(`
      <div class="row between"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
      <p class="small muted">${opts.editId ? "New logs and search will use these numbers. Meals you already logged stay as they were." : "Copy the numbers from the label. It's saved to ⭐ My foods so you can log it again in one tap."}</p>
      <label class="field">Name<input class="input" id="cName" placeholder="e.g. Mom's oxtail stew" value="${val(v.name)}"></label>
      <div class="grid-2">
        <label class="field">Serving<input class="input" id="cServ" placeholder="e.g. 1 bowl" value="${val(v.serving)}"></label>
        <label class="field">Serving in grams<input class="input" id="cG" type="number" inputmode="decimal" placeholder="optional" value="${val(v.g)}"></label>
      </div>
      <div class="grid-2">
        ${num("kcal", "Calories")}${num("p", "Protein (g)")}${num("c", "Carbs (g)")}${num("f", "Fat (g)")}
        ${num("fib", "Fiber (g)")}${num("sug", "Sugar (g)")}${num("na", "Sodium (mg)")}${num("satf", "Sat. fat (g)")}
      </div>
      <div class="row">${opts.editId ? `<button class="btn danger" data-act="del-food">Delete</button>` : ""}<button class="btn primary grow" data-act="save-custom">${cta}</button></div>`);
  }

  function saveCustom() {
    const st = sheetState;
    const name = $("#cName").value.trim();
    const kcal = Number($("#c_kcal").value);
    if (!name || !(kcal >= 0) || $("#c_kcal").value === "") return toast("Add a name and calories");
    const g = Number($("#cG").value);
    const vals = { name, serving: $("#cServ").value.trim() || "1 serving" };
    NUTS.forEach((k) => (vals[k] = Number($("#c_" + k).value) || 0));
    if (st.editId) {
      const f = S.custom.find((c) => c.id === st.editId);
      if (!f) return closeSheet();
      Object.assign(f, vals);
      if (g > 0) f.g = g; else delete f.g;
      if (!f.g && S.lastQty?.[f.id]) S.lastQty[f.id] = { qty: 1, mode: "serv" };
      save(); render();
      toast("Saved — new logs use these numbers");
      return foodSheet(f);
    }
    const f = { id: "c:" + uid(), ...vals };
    if (g > 0) f.g = g;
    S.custom.unshift(f);
    if (st.linkItem) {
      const it = dayLog(ui.date).items.find((i) => i.id === st.linkItem);
      if (it) it.foodId = f.id;
      S.recents = [f.id, ...S.recents.filter((x) => x !== f.id)].slice(0, 30);
      save(); closeSheet(); render();
      return toast("⭐ Saved to My foods");
    }
    sheetState = { food: f, qty: 1, meal: ui.meal, mode: "serv" };
    saveItem();
  }

  function deleteCustom(id) {
    const idx = S.custom.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const [gone] = S.custom.splice(idx, 1);
    save(); closeSheet(); render();
    toast(`Deleted “${gone.name}”`, { label: "Undo", fn: () => { S.custom.splice(idx, 0, gone); save(); render(); toast("Restored"); } });
  }

  function scanSheet() {
    openSheet(`
      <div class="row between"><h2>Scan your plate</h2><button class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
      <div class="scan" style="flex-direction:column;align-items:flex-start;gap:10px"><span class="ico">${ICON.camera}</span>
        <p>Soon you'll point your camera at a meal and see each food, its portion and its calories <b>before you eat it</b> — checked against your sugar, sodium and fat limits.</p></div>
      <p class="small muted">Until then, search the food list or add your own. Everything you log now will carry over.</p>
      <button class="btn primary block" data-close>Got it</button>`);
  }

  // ---------- Meals ----------
  function getPlan(k) {
    let pl = S.plans[k];
    if (!pl || !Object.keys(pl.slots || {}).length) { pl = S.plans[k] = buildPlan(k); save(); }
    return pl;
  }

  function recipeCard(r, slot, m) {
    const p = S.profile;
    const n = scale(r, m);
    const why = whyRecipe(p, r);
    return `<article class="recipe">
      ${slot ? `<div class="row between"><span class="slot">${MEAL_LABEL[slot]}</span><span class="tag plain">${LEVEL_LABEL[r.level]}</span></div>` : ""}
      <button style="all:unset;cursor:pointer" data-act="recipe" data-id="${r.id}" data-m="${m}"><h3>${esc(r.name)}</h3></button>
      <div class="meta"><span class="num">${ICON.clock.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')} ${r.mins} min</span><span class="num"><b style="color:var(--kcal)">${fmt(n.kcal)}</b> kcal</span><span class="num">P ${fmt(n.p)} · C ${fmt(n.c)} · F ${fmt(n.f)}</span>${!slot ? `<span>${LEVEL_LABEL[r.level]}</span>` : ""}</div>
      ${m !== 1 ? `<p class="small muted">Eat ${m} servings to hit your target</p>` : ""}
      ${why.length ? `<p class="why">✓ ${why.join(" · ")}</p>` : ""}
      <div class="actions">
        <button class="btn small" data-act="recipe" data-id="${r.id}" data-m="${m}">See recipe</button>
        ${slot ? `<button class="btn small ghost" data-act="swap" data-v="${slot}">${ICON.swap} Swap</button>` : ""}
        <button class="btn small ghost" data-act="log-recipe" data-id="${r.id}" data-m="${m}" data-slot="${slot || ""}">${ICON.plus} I ate this</button>
      </div></article>`;
  }

  function renderMeals() {
    const p = S.profile, t = targets(p);
    const head = `<header class="head"><div><div class="eyebrow">${COOK[p.cook].emoji} ${COOK[p.cook].label}</div><h1>Meal ideas</h1></div></header>
      <div class="seg" style="align-self:flex-start"><button data-act="mmode" data-v="plan" aria-pressed="${ui.mealsMode === "plan"}">Plan my day</button><button data-act="mmode" data-v="browse" aria-pressed="${ui.mealsMode === "browse"}">Browse all</button></div>`;
    if (!RECIPES.length) return head + `<p class="muted">Recipes are still loading.</p>`;

    if (ui.mealsMode === "plan") {
      const pl = getPlan(ui.date);
      const items = MEALS.map((m) => pl.slots[m.id] && { slot: m.id, r: RECIPE_BY_ID.get(pl.slots[m.id].id), m: pl.slots[m.id].m }).filter((x) => x && x.r);
      const tot = sum(items.map((x) => scale(x.r, x.m)));
      return head + `
        <div class="stack"><span class="small muted" style="font-weight:600">Cooking mood ${ui.date === todayKey() ? "today" : "this day"}</span>
          <div class="seg" style="align-self:flex-start">${[["easy", "Keep it easy"], ["usual", "My usual"], ["cook", "Let's cook"]].map(([v, l]) => `<button data-act="mood" data-v="${v}" aria-pressed="${pl.mood === v}">${l}</button>`).join("")}</div></div>
        <section class="card row between"><div><h3>Plan total</h3><span class="small muted num">P ${fmt(tot.p)} g · C ${fmt(tot.c)} g · F ${fmt(tot.f)} g · Fiber ${fmt(tot.fib)} g</span></div>
          <div style="text-align:right"><b class="num" style="font-size:20px">${fmt(tot.kcal)}</b><div class="tiny muted">of ${fmt(t.kcal)} kcal</div></div></section>
        ${items.map((x) => recipeCard(x.r, x.slot, x.m)).join("")}
        <button class="btn block" data-act="replan">${ICON.swap} Give me a whole new day</button>`;
    }

    const allowed = ui.browseLevel === "mine" ? COOK[p.cook].levels : ui.browseLevel === "all" ? ["easy", "medium", "chef"] : [ui.browseLevel];
    const q = ui.browseQ.toLowerCase();
    const list = RECIPES.filter((r) => !excludedBy(p, r) && allowed.includes(r.level) && (ui.browseMeal === "all" || r.meal.includes(ui.browseMeal)) && (!q || (r.name + " " + r.ingredients.join(" ")).toLowerCase().includes(q)))
      .sort((a, b) => scoreRecipe(p, b, b.kcal) - scoreRecipe(p, a, a.kcal));
    const hidden = RECIPES.filter((r) => excludedBy(p, r)).length;
    return head + `
      <div class="search">${ICON.search}<input class="input" id="bq" type="search" placeholder="Search recipes or ingredients" value="${esc(ui.browseQ)}"></div>
      <div class="chips scroll">${[["all", "All meals"], ...MEALS.map((m) => [m.id, m.label])].map(([v, l]) => `<button class="chip" data-act="bmeal" data-v="${v}" aria-pressed="${ui.browseMeal === v}">${l}</button>`).join("")}</div>
      <div class="chips scroll">${[["mine", "My cooking style"], ["easy", "Easy"], ["medium", "Home cooking"], ["chef", "Chef projects"], ["all", "Every level"]].map(([v, l]) => `<button class="chip" data-act="blevel" data-v="${v}" aria-pressed="${ui.browseLevel === v}">${l}</button>`).join("")}</div>
      <p class="small muted">${list.length} recipes${hidden ? ` · ${hidden} hidden because of foods you don't eat` : ""}</p>
      <div class="stack" id="blist">${list.map((r) => recipeCard(r, null, 1)).join("") || `<p class="empty">No recipes match. Try another filter.</p>`}</div>`;
  }

  function recipeSheet(r, m) {
    const n = scale(r, m);
    const p = S.profile;
    const warn = nutrientWarnings(n);
    openSheet(`
      <div class="row between" style="align-items:flex-start"><div class="grow"><span class="tag plain">${LEVEL_LABEL[r.level]}</span><h2 style="margin-top:6px">${esc(r.name)}</h2>
        <p class="small muted">${r.mins} min · makes ${r.serves} serving${r.serves > 1 ? "s" : ""} · nutrition for ${m === 1 ? "1 serving" : m + " servings"}</p></div><button class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
      ${nutritionBlock(n)}
      ${whyRecipe(p, r).length ? `<p class="why">✓ ${whyRecipe(p, r).join(" · ")}</p>` : ""}
      ${warn.length ? `<div class="stack small" style="color:var(--warn)">${warn.map((w) => `<span>⚠︎ This is ${w}</span>`).join("")}</div>` : ""}
      <div class="chips">${r.tags.map((x) => `<span class="tag">${esc(x.replace(/-/g, " "))}</span>`).join("")}</div>
      <div class="stack"><h3>Ingredients</h3><ul class="ing">${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
      <div class="stack"><h3>Steps</h3><ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>
      <button class="btn primary block" data-act="log-recipe" data-id="${r.id}" data-m="${m}">${ICON.plus} I ate this</button>`);
  }

  // ---------- Insights ----------
  function renderInsights() {
    const p = S.profile, t = targets(p);
    const end = ui.date;
    const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
    const totals = days.map((k) => ({ k, n: dayTotals(k), items: S.logs[k]?.items || [] }));
    const logged = totals.filter((d) => d.items.length);
    const avg = logged.length ? scale(sum(logged.map((d) => d.n)), 1 / logged.length) : zero();
    const max = Math.max(t.kcal * 1.3, ...totals.map((d) => d.n.kcal));
    const chart = `<div class="chart"><div class="goal" style="bottom:${(t.kcal / max) * 110 + 22}px"></div>${totals.map((d) => {
      const h = (d.n.kcal / max) * 110;
      return `<div class="col"><div class="b ${!d.items.length ? "none" : d.n.kcal > t.kcal * 1.1 ? "over" : ""}" style="height:${d.items.length ? h : 4}px" title="${fmt(d.n.kcal)} kcal"></div><span class="d">${dateOf(d.k).toLocaleDateString(undefined, { weekday: "narrow" })}</span></div>`;
    }).join("")}</div>`;

    const topSources = (key, n = 3) => {
      const m = new Map();
      logged.forEach((d) => d.items.forEach((i) => m.set(i.name, (m.get(i.name) || 0) + (i[key] || 0))));
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).filter((x) => x[1] > 0).map((x) => x[0]);
    };
    const srcs = (key) => topSources(key).join("; ");
    const tips = [];
    if (logged.length < 3) tips.push(["warn", "Keep logging", `You've logged ${logged.length} of the last 7 days. After 3 days we can spot real patterns in how you eat.`]);
    if (logged.length) {
      const kr = avg.kcal / t.kcal;
      if (kr > 1.1) tips.push(["bad", "Calories running high", `You're averaging ${fmt(avg.kcal)} kcal — ${fmt(avg.kcal - t.kcal)} over your target. Biggest contributors: ${srcs("kcal")}.`]);
      else if (kr < 0.75) tips.push(["warn", "You may be eating too little", `Averaging ${fmt(avg.kcal)} kcal. Eating far below your target can slow your metabolism and lead to overeating later — or you might be forgetting to log snacks and drinks.`]);
      else tips.push(["good", "Calories on track", `Averaging ${fmt(avg.kcal)} kcal against your ${fmt(t.kcal)} target. Nice work.`]);
      if (avg.p < t.p * 0.8) tips.push(["warn", "Add more protein", `${fmt(avg.p)} g a day vs your ${t.p} g goal. Easy wins: Greek yogurt, eggs, chicken, beans, tuna, tofu or cottage cheese.`]);
      if (avg.fib < t.fib * 0.7) tips.push(["warn", "Fiber is low", `${fmt(avg.fib)} g vs ${t.fib} g. ${t.dm ? "Fiber slows how fast sugar hits your blood — important with diabetes in the family. " : ""}Add beans, lentils, oats, berries, vegetables or whole grains.`]);
      if (avg.sug > t.sug) tips.push(["bad", "Too much sugar", `${fmt(avg.sug)} g a day vs your ${t.sug} g limit${t.dm ? " (set lower because of diabetes risk)" : ""}. Top sources: ${srcs("sug")}.`]);
      if (avg.na > t.na) tips.push(["bad", "Sodium is over your limit", `${fmt(avg.na)} mg a day vs ${fmt(t.na)} mg${t.naRisk ? " — this matters for your blood pressure history" : ""}. Top sources: ${srcs("na")}.`]);
      if (avg.satf > t.satf) tips.push(["bad", "Saturated fat is high", `${fmt(avg.satf)} g vs ${t.satf} g. Top sources: ${srcs("satf")}. Swap toward olive oil, fish, nuts and lean protein.`]);
      const noBreakfast = logged.filter((d) => !d.items.some((i) => i.meal === "breakfast")).length;
      if (logged.length >= 3 && noBreakfast / logged.length >= 0.5) tips.push(["warn", "Breakfast is often skipped", `No breakfast on ${noBreakfast} of ${logged.length} days. ${t.dm ? "A protein-rich breakfast helps keep blood sugar steady through the day." : "A protein breakfast can cut evening cravings."}`]);
      const heavyNight = logged.filter((d) => d.n.kcal && sum(d.items.filter((i) => i.meal === "dinner" || i.meal === "snack")).kcal / d.n.kcal > 0.6).length;
      if (logged.length >= 3 && heavyNight >= 2) tips.push(["warn", "Most of your eating is at night", `On ${heavyNight} days, over 60% of your calories came from dinner and snacks. Moving some to lunch helps energy and sleep.`]);
      const water = days.reduce((s, k) => s + (S.logs[k]?.water || 0), 0) / 7;
      if (water < 5 && logged.length >= 3) tips.push(["warn", "Drink more water", `About ${r1(water)} glasses a day. Aim for 8 — thirst is often mistaken for hunger.`]);
    }
    if (tips.length === 1 && tips[0][0] === "good") tips.push(["good", "Everything else looks balanced", "Protein, fiber, sugar and sodium are all within your targets this week."]);

    const stat = (l, v, g, unit, kind) => `<div class="nut"><b class="num" style="color:${kind === "max" ? (v > g ? "var(--bad)" : "var(--good)") : v >= g * 0.9 ? "var(--good)" : "var(--warn)"}">${fmt(v)}${unit}</b><span>${l} · ${kind === "max" ? "max" : "goal"} ${fmt(g)}</span></div>`;
    return `
      <header class="head"><div><div class="eyebrow">Last 7 days</div><h1>Your habits</h1></div></header>
      <section class="card"><div class="card-title"><h3>Daily calories</h3><span class="tiny muted">dashed line = target</span></div>${chart}</section>
      <section class="card"><div class="card-title"><h3>Daily averages</h3><span class="tiny muted">${logged.length} day${logged.length === 1 ? "" : "s"} logged</span></div>
        <div class="nut-grid">${stat("Protein", avg.p, t.p, " g", "min")}${stat("Fiber", avg.fib, t.fib, " g", "min")}${stat("Sugar", avg.sug, t.sug, " g", "max")}${stat("Sodium", avg.na, t.na, "", "max")}</div></section>
      <section class="card"><div class="card-title"><h3>What to work on</h3></div>
        ${tips.map(([k, h, b]) => `<div class="tip"><span class="dot ${k === "good" ? "" : k}"></span><div><b>${h}</b><p class="small muted" style="margin-top:2px">${b}</p></div></div>`).join("")}</section>`;
  }

  // ---------- Badges ----------
  function badges() {
    const t = targets(S.profile);
    const logs = Object.values(S.logs);
    const days = logs.filter((l) => l.items?.length).map((l) => sum(l.items));
    const items = logs.flatMap((l) => l.items || []);
    const kinds = new Set(items.map((i) => i.foodId || i.name)).size;
    const best = bestStreak();
    return [
      ["🌱", "First log", items.length > 0, "Log anything at all"],
      ["🔥", "3-day streak", best >= 3, `Log 3 days in a row${best && best < 3 ? ` · best ${best}` : ""}`],
      ["⚡", "7-day streak", best >= 7, `Log 7 days in a row${best && best < 7 ? ` · best ${best}` : ""}`],
      ["🥦", "Fiber hero", days.some((n) => n.fib >= t.fib), `Reach ${t.fib} g fiber in a day`],
      ["💪", "Protein pro", days.some((n) => n.p >= t.p), `Reach ${t.p} g protein in a day`],
      ["💧", "Water champ", logs.some((l) => (l.water || 0) >= 8), "Drink 8 glasses in a day"],
      ["👩‍🍳", "Chef mode", items.some((i) => String(i.foodId).startsWith("r:")), "Log one of the recipes"],
      ["🧭", "Explorer", kinds >= 10, `10 different foods · ${Math.min(kinds, 10)}/10`],
    ];
  }

  // ---------- Profile ----------
  function renderProfile() {
    const p = S.profile, t = targets(p), us = p.units === "us";
    const h = us ? `${Math.floor(p.heightCm / 2.54 / 12)}′${Math.round(p.heightCm / 2.54 - Math.floor(p.heightCm / 2.54 / 12) * 12)}″` : `${r0(p.heightCm)} cm`;
    const w = us ? `${r0(p.weightKg * 2.20462)} lb` : `${r1(p.weightKg)} kg`;
    const conds = CONDITIONS.filter((c) => risk(p, c.id)).map((c) => `${c.label} (${p.conditions[c.id] === "me" ? "me" : "family"})`);
    const dis = [...DISLIKES.filter(([v]) => p.dislikes.includes(v)).map(([, l]) => l), ...(p.dislikeText ? [p.dislikeText] : [])];
    const row = (label, value, step) => `<button class="item" data-act="edit-step" data-v="${step}"><div class="grow"><span class="tiny muted">${label}</span><b>${esc(value) || "—"}</b></div>${ICON.right.replace("<svg", '<svg width="18" height="18" style="color:var(--muted)"')}</button>`;
    return `
      <header class="head"><div><div class="eyebrow">Your profile</div><h1>${esc(p.name) || "Me"}</h1></div></header>
      <section class="card stack"><div class="row" style="align-items:baseline;gap:8px"><span class="hero-num" style="font-size:36px">${fmt(t.kcal)}</span><span class="muted">kcal a day</span></div>
        <div class="nut-grid"><div class="nut"><b style="color:var(--protein)">${t.p} g</b><span>Protein</span></div><div class="nut"><b style="color:var(--carbs)">${t.c} g</b><span>Carbs</span></div><div class="nut"><b style="color:var(--fat)">${t.f} g</b><span>Fat</span></div><div class="nut"><b>${t.fib} g</b><span>Fiber</span></div></div>
        <div class="grid-3 small" style="text-align:center"><div><b class="num">${t.sug} g</b><div class="tiny muted">sugar max</div></div><div><b class="num">${fmt(t.na)} mg</b><div class="tiny muted">sodium max</div></div><div><b class="num">${t.satf} g</b><div class="tiny muted">sat. fat max</div></div></div>
        <details><summary class="small" style="cursor:pointer;color:var(--accent);font-weight:600">How we worked this out</summary><div class="stack" style="margin-top:10px">${targetReasons(p, t).map((x) => `<p class="small">${x}</p>`).join("")}</div></details></section>
      ${(() => { const b = badges(), got = b.filter((x) => x[2]).length; return `<section class="card">
        <div class="card-title"><h3>Badges</h3><span class="tiny muted">${got} of ${b.length} earned</span></div>
        <div class="badges">${b.map(([e, name, on, hint]) => `<div class="badge ${on ? "on" : ""}"><span class="be">${e}</span><div class="grow"><b>${name}</b><span>${on ? "Earned ✓" : hint}</span></div></div>`).join("")}</div>
      </section>`; })()}
      <section class="card" style="padding:4px 16px">
        ${row("Body", `${p.age} yrs · ${h} · ${w}`, "body")}
        ${row("Activity & goal", `${ACTIVITY[p.activity].label} · ${{ lose: "Lose weight", maintain: "Maintain", gain: "Gain" }[p.goal]}`, "goal")}
        ${row("Family health", conds.join(", ") || "Nothing noted", "health")}
        ${row("Foods I avoid", [p.diet !== "any" ? p.diet[0].toUpperCase() + p.diet.slice(1) : "", ...dis].filter(Boolean).join(", ") || "None", "food")}
        ${row("Cooking", COOK[p.cook].label, "cook")}
        ${row("Name & units", `${p.name || "—"} · ${us ? "lb / ft" : "kg / cm"}`, "welcome")}
      </section>
      <section class="card stack"><h3>Your data</h3><p class="small muted">Everything is stored only on this device. Back it up to move to a new phone.</p>
        <div class="row wrap"><button class="btn small" data-act="export">Download backup</button><label class="btn small" style="cursor:pointer">Restore backup<input type="file" accept="application/json" id="importFile" hidden></label><button class="btn small danger" data-act="reset">Erase everything</button></div></section>
      <p class="disclaimer">Calorie Coach gives general nutrition guidance, not medical advice. Nutrition values are averages from USDA FoodData Central and will vary by brand and recipe.</p>`;
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const tab = e.target.closest("[data-tab]");
    if (tab) { ui.tab = tab.dataset.tab; if (tab.dataset.tab === "add") ui.meal = ui.date === todayKey() ? guessMeal() : ui.meal; window.scrollTo(0, 0); return render(); }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act, v = el.dataset.v;
    const d = draft;
    switch (act) {
      // onboarding
      case "units": obDraft().units = v; return render();
      case "pick": { const dd = obDraft(); dd[el.dataset.k] = ["activity", "pace"].includes(el.dataset.k) ? Number(v) : v; return render(); }
      case "cond": obDraft().conditions[el.dataset.id] = v; return render();
      case "dislike": { const dd = obDraft(); dd.dislikes = dd.dislikes.includes(v) ? dd.dislikes.filter((x) => x !== v) : [...dd.dislikes, v]; return render(); }
      case "ob-back": ui.ob = Math.max(0, ui.ob - 1); window.scrollTo(0, 0); return render();
      case "ob-next":
        if (OB_STEPS[ui.ob] === "result") { S.profile = d; draft = null; ui.tab = "today"; save(); toast("You're all set"); }
        else ui.ob++;
        window.scrollTo(0, 0); return render();
      case "ob-save": {
        const old = S.profile;
        S.profile = d; draft = null; ui.editStep = null;
        // Anything that changes what we'd suggest invalidates today's and future meal plans.
        const sig = (p) => JSON.stringify([p.dislikes, p.dislikeText, p.diet, p.cook, p.conditions, p.goal, p.weightKg, p.activity]);
        if (sig(old) !== sig(S.profile)) S.plans = Object.fromEntries(Object.entries(S.plans).filter(([k]) => k < todayKey()));
        save(); toast("Saved"); return render();
      }
      case "ob-cancel": draft = null; ui.editStep = null; return render();
      case "edit-step": draft = null; obDraft(); ui.editStep = v; window.scrollTo(0, 0); return render();
      // today
      case "day": { const nk = addDays(ui.date, Number(v)); if (nk > todayKey()) return; ui.date = nk; return render(); }
      case "add-to": ui.meal = v; ui.tab = "add"; window.scrollTo(0, 0); return render();
      case "edit-item": { const it = dayLog(ui.date).items.find((i) => i.id === el.dataset.id); if (!it) return; const f = lookupFood(it.foodId) || { ...it, ...scale(it, 1 / (it.qty || 1)), serving: "serving", orphan: true }; return foodSheet(f, it); }
      case "water": { const l = dayLog(ui.date); l.water = clamp((l.water || 0) + Number(v), 0, 20); save(); return render(); }
      case "quick": return quickLog(el.dataset.id);
      case "same-yday": return sameAsYesterday(v);
      case "dismiss": (S.dismissed ||= {})[v] = 1; save(); return render();
      case "toast-act": { const a = toastAction; $("#toast").classList.remove("show"); toastAction = null; if (a) a.fn(); return; }
      // add
      case "meal": ui.meal = v; return render();
      case "cat": ui.cat = v; return render();
      case "pick-food": { const f = lookupFood(el.dataset.id); if (f) foodSheet(f); return; }
      case "custom": return customSheet({ food: { name: ui.query.trim() } });
      case "edit-food": { const f = S.custom.find((c) => c.id === el.dataset.id); if (f) customSheet({ food: f, editId: f.id }); return; }
      case "del-food": return deleteCustom(sheetState?.editId);
      case "save-as-mine": { const st = sheetState; const n = st.food; return customSheet({ food: { ...n, name: st.existing.name, serving: "1 serving", g: undefined }, linkItem: st.existing.id }); }
      case "save-custom": return saveCustom();
      case "scan": return scanSheet();
      // sheet
      case "qty": {
        const st = sheetState, dir = Math.sign(Number(v));
        if (st.mode === "g") {
          const g = Math.max(5, Math.round((st.food.g * st.qty) / 5) * 5 + dir * 10);
          st.qty = g / st.food.g;
          $("#qty").value = g;
        } else {
          st.qty = Math.max(0.25, Math.round(st.qty * 4) / 4 + dir * 0.25);
          $("#qty").value = st.qty;
        }
        return drawFoodSheet(true);
      }
      case "qmode": sheetState.mode = v; return drawFoodSheet();
      case "smeal": sheetState.meal = v; return drawFoodSheet();
      case "save-item": return saveItem();
      case "del-item": { const l = dayLog(ui.date); l.items = l.items.filter((i) => i !== sheetState.existing); save(); closeSheet(); toast("Removed"); return render(); }
      // meals
      case "mmode": ui.mealsMode = v; return render();
      case "mood": { S.plans[ui.date] = buildPlan(ui.date, v, {}); save(); return render(); }
      case "swap": { const pl = getPlan(ui.date); const spins = { ...pl.spins, [v]: (pl.spins[v] || 0) + 1 }; S.plans[ui.date] = buildPlan(ui.date, pl.mood, spins); save(); return render(); }
      case "replan": { const pl = getPlan(ui.date); const spins = Object.fromEntries(MEALS.map((m) => [m.id, (pl.spins[m.id] || 0) + 1])); S.plans[ui.date] = buildPlan(ui.date, pl.mood, spins); save(); toast("New plan ready"); return render(); }
      case "recipe": { const r = RECIPE_BY_ID.get(el.dataset.id); if (r) recipeSheet(r, Number(el.dataset.m) || 1); return; }
      case "log-recipe": {
        const r = RECIPE_BY_ID.get(el.dataset.id); if (!r) return;
        const m = Number(el.dataset.m) || 1, meal = el.dataset.slot || (r.meal.includes(guessMeal()) ? guessMeal() : r.meal[0]);
        const it = { id: uid(), foodId: "r:" + r.id, name: r.name, meal, qty: m, label: `${m} × serving`, t: Date.now(), ...scale(r, m) };
        dayLog(ui.date).items.push(it);
        S.recents = ["r:" + r.id, ...S.recents.filter((x) => x !== "r:" + r.id)].slice(0, 30);
        (S.lastQty ||= {})["r:" + r.id] = { qty: m, mode: "serv" };
        save(); closeSheet(); render(); return afterLog(ui.date, `Logged to ${MEAL_LABEL[meal]}`, [it.id]);
      }
      case "bmeal": ui.browseMeal = v; return render();
      case "blevel": ui.browseLevel = v; return render();
      // profile
      case "export": {
        const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `calorie-coach-backup-${todayKey()}.json` });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
      }
      case "reset": if (confirm("Erase your profile and every logged meal on this device? This can't be undone.")) { S = blank(); save(); ui.ob = 0; draft = null; render(); } return;
    }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.f) return obInput(el);
    if (el.id === "q") { ui.query = el.value; return updateResults(); }
    if (el.id === "bq") {
      ui.browseQ = el.value;
      const tmp = document.createElement("div"); tmp.innerHTML = renderMeals();
      $("#blist").innerHTML = $("#blist", tmp).innerHTML; return;
    }
    if (el.id === "qty" && sheetState) {
      const n = Number(el.value);
      if (!(n > 0)) return;
      sheetState.qty = sheetState.mode === "g" ? n / sheetState.food.g : n;
      return drawFoodSheet(true);
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id !== "importFile") return;
    const file = e.target.files[0]; if (!file) return;
    file.text().then((txt) => {
      const data = JSON.parse(txt);
      if (!data || typeof data !== "object" || !("logs" in data)) throw new Error("bad");
      S = Object.assign(blank(), data); save(); toast("Backup restored"); render();
    }).catch(() => toast("That file isn't a Calorie Coach backup"));
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheetWrap").hidden) closeSheet(); });

  // Roll the date forward if the app stays open past midnight.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ui.date < todayKey() && ui.lastSeenToday !== todayKey()) { ui.date = todayKey(); render(); }
    ui.lastSeenToday = todayKey();
  });
  ui.lastSeenToday = todayKey();

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  render();
})();
