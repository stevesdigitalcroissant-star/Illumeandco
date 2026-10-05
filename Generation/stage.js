// Illume Stage — block a shot in 3D before generating it.
//
// Stand-ins (people, products, a table, a wall, photo cards) on a floor, a shot
// camera with real lenses, and a camera move made of key positions you can play
// back. When the shot looks right, the first frame is rendered as a layout image
// and the move is written out in plain camera language — so the image model gets
// the exact framing and angle, and the video model gets a precise move, instead
// of guessing from words and needing a dozen regenerations.
//
// Loaded on demand by index.html:  (await import("/Generation/stage.js")).openStage(opts)
//   opts = { data, aspect, duration, pictures:[{name,url}], onChange(data), onStartFrame(out),
//            onMoveText(text, dur), onSaveVideo(blob), title }
import * as THREE from "/Generation/vendor/three-stage.min.js";
const { OrbitControls, TransformControls } = THREE;

const LENSES = [16, 24, 35, 50, 85, 135];
const SENSOR_H = 24; // full-frame 36×24 mm: lens → field of view
const vfovFor = (mm, aspect) => { const h = aspect >= 1 ? SENSOR_H : 36; return THREE.MathUtils.radToDeg(2 * Math.atan(h / (2 * mm))); };
const ratioOf = a => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(a || "")); return m ? Number(m[1]) / Number(m[2]) : 16 / 9; };
const uid = () => "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
const arr = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const fmtM = n => (n < 1 ? `${Math.round(n * 100)} cm` : `${n.toFixed(1).replace(/\.0$/, "")} m`);

const KINDS = {
  person: { label: "Person", h: 1.75 },
  bottle: { label: "Bottle", h: 0.3 },
  box: { label: "Box", h: 0.2 },
  can: { label: "Can", h: 0.12 },
  table: { label: "Table", h: 0.75 },
  chair: { label: "Chair", h: 0.9 },
  wall: { label: "Wall", h: 2.6 },
  card: { label: "Photo", h: 1.0 },
};

const CSS = `
.stg{position:fixed;inset:0;z-index:80;background:#0C0B09;display:flex;flex-direction:column;color:#F3EDE2;font:14px/1.4 system-ui,-apple-system,sans-serif}
.stg *{box-sizing:border-box}
.stg button{font:inherit;color:inherit;cursor:pointer}
.stgTop{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,236,200,.1);flex-wrap:wrap}
.stgTop b{font-family:Georgia,serif;font-weight:400;font-size:20px;margin-right:auto;display:flex;align-items:center;gap:10px}
.stgTop b::before{content:"";width:10px;height:10px;border-radius:50%;background:#E8B54B;box-shadow:0 0 12px #E8B54B}
.stgBtn{background:#1B1814;border:1px solid rgba(255,236,200,.14);border-radius:11px;padding:8px 12px;font-size:13px;white-space:nowrap}
.stgBtn:hover{border-color:rgba(232,181,75,.5)}
.stgBtn.on{background:rgba(232,181,75,.16);border-color:rgba(232,181,75,.6);color:#FFE7B0}
.stgBtn.gold{background:linear-gradient(180deg,#F2C66A,#E8B54B);color:#1A1408;border-color:transparent;font-weight:700}
.stgBtn:disabled{opacity:.4;cursor:default}
.stgMain{flex:1;display:flex;min-height:0}
.stgSide{width:250px;flex-shrink:0;border-right:1px solid rgba(255,236,200,.1);padding:12px;overflow:auto;display:flex;flex-direction:column;gap:14px}
.stgSide h5{margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8F8678;font-weight:600}
.stgGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.stgGrid .stgBtn{padding:8px 6px}
.stgPics{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.stgPics button{aspect-ratio:1;border-radius:9px;border:1px solid rgba(255,236,200,.14);background:#1B1814 center/cover no-repeat;padding:0}
.stgView{flex:1;position:relative;min-width:0;background:#141210}
.stgView canvas{display:block;width:100%;height:100%;touch-action:none}
.stgHud{position:absolute;left:12px;top:12px;display:flex;gap:6px;flex-wrap:wrap;z-index:2}
.stgInfo{position:absolute;left:12px;right:12px;bottom:12px;z-index:2;display:flex;gap:10px;align-items:flex-end;justify-content:space-between;pointer-events:none}
.stgInfo > *{pointer-events:auto}
.stgNote{background:rgba(12,11,9,.82);border:1px solid rgba(255,236,200,.12);border-radius:12px;padding:8px 11px;font-size:12.5px;color:#D9D0C2;max-width:560px}
.stgKeys{display:flex;gap:6px;flex-wrap:wrap}
.stgKeys button{background:rgba(12,11,9,.82);border:1px solid rgba(255,236,200,.16);border-radius:999px;padding:6px 11px;font-size:12px}
.stgKeys button.on{border-color:#E8B54B;color:#FFE7B0}
.stgFrame{position:absolute;pointer-events:none;border:1px solid rgba(232,181,75,.7);box-shadow:0 0 0 9999px rgba(0,0,0,.55);z-index:1}
.stgFrame::before,.stgFrame::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 33.2%,rgba(255,236,200,.18) 33.3%,transparent 33.5%,transparent 66.5%,rgba(255,236,200,.18) 66.6%,transparent 66.8%)}
.stgFrame::after{background:linear-gradient(180deg,transparent 33.2%,rgba(255,236,200,.18) 33.3%,transparent 33.5%,transparent 66.5%,rgba(255,236,200,.18) 66.6%,transparent 66.8%)}
.stgSel{display:flex;flex-direction:column;gap:6px}
.stgSel[hidden],.stgFrame[hidden]{display:none}
.stgSel input{width:100%;background:#1B1814;border:1px solid rgba(255,236,200,.14);border-radius:9px;color:inherit;padding:7px 9px;font:inherit;font-size:13px}
.stgRow{display:flex;gap:6px;flex-wrap:wrap}
.stgSmall{font-size:12px;color:#8F8678}
.stgDur{display:flex;align-items:center;gap:8px;font-size:13px}
.stgDur input{flex:1;accent-color:#E8B54B}
.stgRing{position:fixed;z-index:95;border:2px solid #E8B54B;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.6),0 0 24px rgba(232,181,75,.6);pointer-events:none;transition:all .15s ease}
.stgRing.none{box-shadow:0 0 0 9999px rgba(0,0,0,.6);border:0}
.stgTip{position:fixed;z-index:96;width:min(340px,calc(100vw - 24px));background:#1B1814;border:1px solid rgba(232,181,75,.55);border-radius:16px;padding:16px 16px 12px;box-shadow:0 30px 70px -20px rgba(0,0,0,.9);transition:top .25s ease,left .25s ease}
.stgTip small{color:#E8B54B;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.stgTip h4{margin:4px 0 6px;font-family:Georgia,serif;font-weight:400;font-size:20px}
.stgTip p{margin:0 0 12px;color:#D9D0C2;font-size:14px;line-height:1.5}
.stgTip p b{color:#FFE7B0}
.stgTip .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.stgTip .row .sp{flex:1}
.stgTip .wait{font-size:12.5px;color:#8F8678;font-style:italic}
.stgTip .skip{background:none;border:0;color:#8F8678;font-size:12.5px;padding:6px 2px}
@media (max-width:820px){.stgMain{flex-direction:column-reverse}.stgSide{width:auto;max-height:42vh;border-right:0;border-top:1px solid rgba(255,236,200,.1)}}
`;

export function openStage(opts) {
  if (!document.getElementById("stgCss")) { const st = document.createElement("style"); st.id = "stgCss"; st.textContent = CSS; document.head.appendChild(st); }
  const data = JSON.parse(JSON.stringify(opts.data || {}));
  data.objects = Array.isArray(data.objects) ? data.objects : [];
  data.keys = Array.isArray(data.keys) ? data.keys : [];
  data.mm = data.mm || 35;
  data.dur = Math.max(2, Math.min(30, Number(opts.duration || data.dur || 5)));
  const aspect = ratioOf(opts.aspect);
  if (!data.objects.length) data.objects.push({ id: uid(), kind: "person", label: "Person", pos: [0, 0, 0], rotY: 0, scale: 1 }); // start with someone on set
  if (!data.cam) data.cam = { pos: [0, 1.5, 3.2], target: [0, 1.2, 0] };

  // ---------- DOM ----------
  const root = document.createElement("div"); root.className = "stg";
  root.innerHTML = `
    <div class="stgTop"><b>Stage${opts.title ? " · " + esc(opts.title) : ""}</b>
      <button class="stgBtn" data-a="help">▶ Show me how</button>
      <button class="stgBtn" data-a="video">⬇ Preview video</button>
      <button class="stgBtn" data-a="movetext">Use the move in a video prompt</button>
      <button class="stgBtn gold" data-a="frame">Make the start frame →</button>
      <button class="stgBtn" data-a="close" aria-label="Close">✕</button></div>
    <div class="stgMain">
      <div class="stgSide">
        <div><h5>Add to the set</h5><div class="stgGrid">
          <button class="stgBtn" data-add="person">🧍 Person</button><button class="stgBtn" data-add="bottle">🧴 Bottle</button>
          <button class="stgBtn" data-add="box">📦 Box</button><button class="stgBtn" data-add="can">🥫 Can</button>
          <button class="stgBtn" data-add="table">🪑 Table</button><button class="stgBtn" data-add="chair">💺 Chair</button>
          <button class="stgBtn" data-add="wall">▭ Wall</button></div></div>
        ${(opts.pictures || []).length ? `<div><h5>Photo cards</h5><div class="stgPics">${opts.pictures.slice(0, 18).map((p, i) => `<button title="${esc(p.name || "Photo")}" data-pic="${i}" style="background-image:url('${esc(p.url)}')"></button>`).join("")}</div><div class="stgSmall" style="margin-top:6px">Your cast, brand photos and takes — placed as a flat card so you know who or what is where.</div></div>` : ""}
        <div class="stgSel" data-sel hidden><h5>Selected</h5><input data-label placeholder="Name it (e.g. Mia, the bottle)">
          <div class="stgRow"><button class="stgBtn on" data-tm="translate">Move</button><button class="stgBtn" data-tm="rotate">Turn</button><button class="stgBtn" data-tm="scale">Size</button><button class="stgBtn" data-a="del">🗑</button></div></div>
        <div><h5>Lens</h5><div class="stgRow" data-lenses>${LENSES.map(l => `<button class="stgBtn" data-mm="${l}">${l}mm</button>`).join("")}</div>
          <div class="stgSmall" style="margin-top:6px">Wide (16–24) shows more and exaggerates depth · 35–50 feels natural · 85–135 flattens and isolates.</div></div>
        <div><h5>Camera move</h5>
          <div class="stgRow"><button class="stgBtn" data-a="kstart">① Set start</button><button class="stgBtn" data-a="kmid">＋ Point</button><button class="stgBtn" data-a="kend">⚑ Set end</button></div>
          <div class="stgDur" style="margin-top:8px"><span>Length</span><input type="range" min="2" max="30" step="1" data-dur><b data-durv></b></div>
          <div class="stgRow" style="margin-top:8px"><button class="stgBtn" data-a="play">▶ Play the move</button><button class="stgBtn" data-a="kclear">Clear move</button></div></div>
      </div>
      <div class="stgView"><div class="stgHud"><button class="stgBtn" data-v="lens">🎥 Through the lens</button><button class="stgBtn" data-v="dir">🧭 Director view</button></div>
        <div class="stgFrame" hidden></div>
        <div class="stgInfo"><div class="stgNote" data-desc></div><div class="stgKeys" data-keys></div></div></div>
    </div>`;
  document.body.appendChild(root);
  const $q = s => root.querySelector(s);
  const view = $q(".stgView"), frameEl = $q(".stgFrame");

  // ---------- three ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  view.insertBefore(renderer.domElement, view.firstChild);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1814); scene.fog = new THREE.Fog(0x1a1814, 14, 40);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2520, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 }); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(20, 20, 0x5a5248, 0x403a33); grid.position.y = 0.002; scene.add(grid);

  const dirCam = new THREE.PerspectiveCamera(45, 1, 0.05, 200); dirCam.position.set(5, 4.5, 6);
  const shotCam = new THREE.PerspectiveCamera(vfovFor(data.mm, aspect), aspect, 0.05, 200);
  shotCam.position.copy(v3(data.cam.pos)); const shotTarget = v3(data.cam.target); shotCam.lookAt(shotTarget);
  const camHelper = new THREE.CameraHelper(shotCam); scene.add(camHelper);
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0xE8B54B, emissive: 0x3a2a08 })); scene.add(camBody);

  let mode = "lens"; // "lens" = look through the shot camera; "dir" = walk around the set
  const orbit = new OrbitControls(shotCam, renderer.domElement); orbit.target.copy(shotTarget); orbit.enableDamping = true; orbit.screenSpacePanning = true;
  const tcontrols = new TransformControls(dirCam, renderer.domElement); tcontrols.setSize(0.9);
  const tHelper = tcontrols.getHelper ? tcontrols.getHelper() : tcontrols; scene.add(tHelper);
  tcontrols.addEventListener("dragging-changed", e => { orbit.enabled = !e.value; if (!e.value) { syncFromMeshes(); changed(); } });

  // ---------- stand-ins ----------
  const grey = c => new THREE.MeshStandardMaterial({ color: c || 0xbdb6aa, roughness: .8 });
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
  function build(o) {
    const g = new THREE.Group(); g.userData.id = o.id;
    const add = (geo, mat, y, x = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    if (o.kind === "person") {
      const m = grey(0xc9c2b6);
      add(new THREE.CapsuleGeometry(0.2, 0.75, 6, 16), m, 1.0);   // torso
      add(new THREE.SphereGeometry(0.12, 24, 16), m, 1.62);         // head
      add(new THREE.CapsuleGeometry(0.075, 0.6, 4, 10), m, 0.38, -0.1); add(new THREE.CapsuleGeometry(0.075, 0.6, 4, 10), m, 0.38, 0.1); // legs
      add(new THREE.BoxGeometry(0.06, 0.04, 0.1), grey(0x8a8378), 1.62, 0, 0.12); // nose: which way they face
    } else if (o.kind === "bottle") { const m = grey(0xdad3c6); add(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 24), m, 0.1); add(new THREE.CylinderGeometry(0.018, 0.022, 0.08, 16), m, 0.24); add(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 16), grey(0x8a8378), 0.29); }
    else if (o.kind === "box") add(new THREE.BoxGeometry(0.2, 0.2, 0.2), grey(0xd6cfc2), 0.1);
    else if (o.kind === "can") add(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 24), grey(0xdad3c6), 0.06);
    else if (o.kind === "table") { const m = grey(0x9c9285); add(new THREE.BoxGeometry(1.2, 0.04, 0.7), m, 0.73); [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]].forEach(([x, z]) => add(new THREE.BoxGeometry(0.04, 0.71, 0.04), m, 0.355, x, z)); }
    else if (o.kind === "chair") { const m = grey(0x9c9285); add(new THREE.BoxGeometry(0.45, 0.04, 0.45), m, 0.46); add(new THREE.BoxGeometry(0.45, 0.45, 0.04), m, 0.7, 0, -0.21); [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => add(new THREE.BoxGeometry(0.035, 0.44, 0.035), m, 0.22, x, z)); }
    else if (o.kind === "wall") add(new THREE.BoxGeometry(4, 2.6, 0.08), grey(0x6e665c), 1.3);
    else if (o.kind === "card") {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: .9 });
      const card = add(new THREE.PlaneGeometry(0.75, 1), mat, 0.5); card.castShadow = true;
      if (o.img) loader.load(o.img, tex => { tex.colorSpace = THREE.SRGBColorSpace; mat.map = tex; mat.needsUpdate = true; const a = tex.image.width / tex.image.height || 0.75; card.scale.x = a / 0.75; }, undefined, () => {});
    }
    g.position.copy(v3(o.pos)); g.rotation.y = o.rotY || 0; g.scale.setScalar(o.scale || 1);
    scene.add(g); return g;
  }
  const meshes = new Map(); data.objects.forEach(o => meshes.set(o.id, build(o)));
  let selected = null;
  function select(id) {
    selected = id; const g = id && meshes.get(id);
    if (g && mode === "dir") tcontrols.attach(g); else tcontrols.detach();
    $q("[data-sel]").hidden = !id;
    if (id) { const o = data.objects.find(x => x.id === id); $q("[data-label]").value = o.label || ""; }
  }
  function syncFromMeshes() {
    data.objects.forEach(o => { const g = meshes.get(o.id); if (!g) return; g.position.y = Math.max(0, g.position.y); o.pos = arr(g.position); o.rotY = +g.rotation.y.toFixed(3); o.scale = +g.scale.x.toFixed(3); });
  }
  function addObj(kind, extra = {}) {
    setTimeout(() => tourEvent("add"), 0);
    const t = lensTarget, o = { id: uid(), kind, label: extra.label || KINDS[kind].label, pos: [+(t.x + (Math.random() - .5) * .8).toFixed(2), 0, +(t.z + (Math.random() - .5) * .4).toFixed(2)], rotY: 0, scale: 1, ...extra };
    if (kind !== "wall") { // a free spot near where the camera looks, not inside someone else
      const taken = data.objects.filter(x => x.kind !== "wall" && x.pos[1] < 0.1).map(x => new THREE.Vector3(x.pos[0], 0, x.pos[2]));
      const need = kind === "table" ? 0.9 : kind === "person" || kind === "chair" ? 0.6 : 0.3;
      for (let i = 0; i < 24; i++) {
        const r = i === 0 ? 0 : 0.8 * (1 + Math.floor((i - 1) / 8)), a = (i % 8) * Math.PI / 4 + Math.PI / 2;
        const c = new THREE.Vector3(t.x + Math.cos(a) * r, 0, t.z + Math.sin(a) * r * 0.6);
        if (taken.every(q => q.distanceTo(c) > need)) { o.pos = [+c.x.toFixed(2), 0, +c.z.toFixed(2)]; break; }
      }
    } else o.pos = [t.x, 0, t.z - 1.6];
    if (["bottle", "box", "can"].includes(kind)) { const tb = data.objects.find(x => x.kind === "table"); if (tb) o.pos = [tb.pos[0] + (Math.random() - .5) * .4, 0.75 * (tb.scale || 1), tb.pos[2]]; }
    data.objects.push(o); meshes.set(o.id, build(o)); setMode("dir"); select(o.id); changed();
  }

  // ---------- camera move ----------
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xE8B54B })); scene.add(pathLine);
  const keyDots = new THREE.Group(); scene.add(keyDots);
  const camState = () => ({ pos: arr(shotCam.position), target: arr(orbit.target), mm: data.mm });
  function setKey(which) {
    setTimeout(() => tourEvent("k" + which), 0);
    const k = camState();
    if (which === "start") data.keys[0] = k;
    else if (which === "end") { if (data.keys.length < 1) data.keys[0] = k; else if (data.keys.length < 2) data.keys.push(k); else data.keys[data.keys.length - 1] = k; }
    else { if (data.keys.length < 2) return say("Set the start and the end first, then add points in between."); data.keys.splice(data.keys.length - 1, 0, k); }
    drawPath(); renderKeys(); changed();
  }
  function curves() {
    const ks = data.keys.filter(Boolean); if (ks.length < 2) return null;
    return { pos: new THREE.CatmullRomCurve3(ks.map(k => v3(k.pos)), false, "centripetal"), tgt: new THREE.CatmullRomCurve3(ks.map(k => v3(k.target)), false, "centripetal"), ks };
  }
  function drawPath() {
    const c = curves(); keyDots.clear();
    data.keys.filter(Boolean).forEach((k, i, a) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x7CD39A : i === a.length - 1 ? 0xF07A6E : 0xE8B54B })); d.position.copy(v3(k.pos)); keyDots.add(d); });
    pathLine.geometry.setFromPoints(c ? c.pos.getPoints(80) : []);
  }
  function applyAt(t) { // t 0..1 along the move
    const c = curves(); if (!c) return;
    const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
    shotCam.position.copy(c.pos.getPointAt(e)); orbit.target.copy(c.tgt.getPointAt(e));
    const n = c.ks.length - 1, seg = Math.min(n - 1, Math.floor(e * n)), f = e * n - seg;
    const mm = c.ks[seg].mm + (c.ks[seg + 1].mm - c.ks[seg].mm) * f; shotCam.fov = vfovFor(mm, aspect); shotCam.updateProjectionMatrix();
    shotCam.lookAt(orbit.target);
  }
  function jumpTo(i) { const k = data.keys[i]; if (!k) return; shotCam.position.copy(v3(k.pos)); orbit.target.copy(v3(k.target)); setLens(k.mm, true); shotCam.lookAt(orbit.target); setMode("lens"); }
  function renderKeys() {
    const box = $q("[data-keys]"), ks = data.keys.filter(Boolean);
    box.innerHTML = ks.map((k, i) => `<button data-k="${i}">${i === 0 ? "① Start" : i === ks.length - 1 && ks.length > 1 ? "⚑ End" : "• " + i} · ${k.mm}mm</button>`).join("");
    box.querySelectorAll("[data-k]").forEach(b => b.onclick = () => jumpTo(Number(b.dataset.k)));
  }
  let playing = null;
  function play(record) {
    if (curves()) setTimeout(() => tourEvent("play"), 0);
    if (!curves()) return say("Set a start and an end first: frame the first moment, tap ① Set start, move the camera, tap ⚑ Set end.");
    setMode("lens"); const t0 = performance.now(), ms = data.dur * 1000;
    return new Promise(res => { playing = { t0, ms, res }; });
  }

  // ---------- describing the shot in camera language ----------
  const subjectOf = k => { // what the camera is pointed at: the stand-in nearest the target
    const t = v3(k.target); let best = null, bd = 1e9;
    data.objects.forEach(o => { if (o.kind === "wall") return; const d = v3(o.pos).setY(0).distanceTo(new THREE.Vector3(t.x, 0, t.z)); if (d < bd) { bd = d; best = o; } });
    return best;
  };
  function shotSize(k) {
    const s = subjectOf(k); if (!s) return "wide shot";
    const h = (KINDS[s.kind] || { h: 1 }).h * (s.scale || 1), d = v3(k.pos).distanceTo(v3(k.target));
    const frac = h / (2 * d * Math.tan(THREE.MathUtils.degToRad(vfovFor(k.mm, aspect)) / 2));
    // frac = how many frames tall the whole subject is: a person filling the frame head-to-toe is a full shot, not a close-up
    if (s.kind === "person") return frac > 7 ? "extreme close-up" : frac > 3.4 ? "close-up" : frac > 2.1 ? "medium close-up" : frac > 1.35 ? "medium shot" : frac > 0.7 ? "full shot" : frac > 0.3 ? "wide shot" : "extreme wide shot";
    return frac > 1.6 ? "extreme close-up (macro detail)" : frac > 0.6 ? "close-up" : frac > 0.3 ? "medium shot" : frac > 0.12 ? "wide shot" : "extreme wide shot";
  }
  function angleOf(k) {
    const p = v3(k.pos), t = v3(k.target), horiz = Math.hypot(p.x - t.x, p.z - t.z), el = THREE.MathUtils.radToDeg(Math.atan2(p.y - t.y, horiz));
    return el > 60 ? "overhead top-down angle" : el > 22 ? "high angle looking down" : el < -15 ? "low angle looking up" : "eye-level angle";
  }
  function layout(k) {
    const cam = new THREE.PerspectiveCamera(vfovFor(k.mm, aspect), aspect, 0.05, 200); cam.position.copy(v3(k.pos)); cam.lookAt(v3(k.target)); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const parts = [];
    data.objects.forEach(o => {
      if (o.kind === "wall") return;
      const c = v3(o.pos).add(new THREE.Vector3(0, ((KINDS[o.kind] || { h: 1 }).h * (o.scale || 1)) / 2, 0)), n = c.clone().project(cam);
      if (n.z > 1 || Math.abs(n.x) > 1.15 || Math.abs(n.y) > 1.15) return; // not in frame
      const x = n.x < -0.33 ? "on the left third" : n.x > 0.33 ? "on the right third" : "in the center";
      const d = cam.position.distanceTo(c), depth = d < 1.2 ? "in the foreground" : d > 4 ? "in the background" : "";
      parts.push(`${o.label && o.label !== KINDS[o.kind].label ? o.label + " (" + KINDS[o.kind].label.toLowerCase() + ")" : "a " + KINDS[o.kind].label.toLowerCase()} ${x}${depth ? " " + depth : ""}`);
    });
    if (data.objects.some(o => o.kind === "wall")) parts.push("a wall behind");
    return parts;
  }
  function describeStart() {
    const k = data.keys[0] || camState();
    return `${k.mm}mm lens, ${shotSize(k)}, ${angleOf(k)}, camera ${fmtM(v3(k.pos).y)} high and ${fmtM(v3(k.pos).distanceTo(v3(k.target)))} from the subject`;
  }
  function describeMove() {
    const ks = data.keys.filter(Boolean); if (ks.length < 2) return "";
    const a = ks[0], b = ks[ks.length - 1], pa = v3(a.pos), pb = v3(b.pos), ta = v3(a.target), tb = v3(b.target);
    const out = [], da = pa.distanceTo(ta), db = pb.distanceTo(tb);
    const az = (p, t) => Math.atan2(p.x - t.x, p.z - t.z);
    let dAz = THREE.MathUtils.radToDeg(az(pb, tb) - az(pa, ta)); dAz = ((dAz + 540) % 360) - 180;
    const targetMoved = ta.distanceTo(tb), camMoved = pa.distanceTo(pb);
    if (camMoved < 0.08 && targetMoved > 0.1) { // the camera stays, only turns
      const fa = new THREE.Vector3().subVectors(ta, pa), fb = new THREE.Vector3().subVectors(tb, pb);
      let yaw = THREE.MathUtils.radToDeg(Math.atan2(fb.x, fb.z) - Math.atan2(fa.x, fa.z)); yaw = ((yaw + 540) % 360) - 180;
      const tilt = THREE.MathUtils.radToDeg(Math.atan2(fb.y, Math.hypot(fb.x, fb.z)) - Math.atan2(fa.y, Math.hypot(fa.x, fa.z)));
      if (Math.abs(yaw) > 5) out.push(`the camera stays in place and pans ${Math.round(Math.abs(yaw))}° to the ${yaw > 0 ? "left" : "right"}`);
      if (Math.abs(tilt) > 5) out.push(`tilts ${tilt > 0 ? "up" : "down"} ${Math.round(Math.abs(tilt))}°`);
    } else {
      if (Math.abs(dAz) > 8) out.push(`arcs ${Math.round(Math.abs(dAz))}° around the subject to the ${dAz > 0 ? "right" : "left"}`);
      else if (targetMoved > 0.3 && Math.abs(da - db) < 0.25) {
        const right = new THREE.Vector3().subVectors(ta, pa).cross(new THREE.Vector3(0, 1, 0)).normalize();
        out.push(`tracks ${new THREE.Vector3().subVectors(pb, pa).dot(right) > 0 ? "right" : "left"} alongside the subject for ${fmtM(camMoved)}`);
      }
      if (db < da * 0.85) out.push(`dollies in from ${fmtM(da)} to ${fmtM(db)}`);
      else if (db > da * 1.15) out.push(`pulls back from ${fmtM(da)} to ${fmtM(db)}`);
      const dh = pb.y - pa.y;
      if (Math.abs(dh) > 0.25) out.push(`${dh > 0 ? "cranes up" : "cranes down"} from ${fmtM(pa.y)} to ${fmtM(pb.y)} high`);
    }
    if (a.mm !== b.mm) out.push(`zooms from ${a.mm}mm to ${b.mm}mm`);
    if (!out.length) return `Locked-off static camera: ${describeStart()}. No camera movement for ${data.dur} seconds.`;
    const via = ks.length > 2 ? ` through ${ks.length - 2} in-between position${ks.length > 3 ? "s" : ""}` : "";
    return `Camera starts with ${an(describeStart())}, then ${out.join(", ")}${via}, ending on ${an(shotSize(b))} at ${an(angleOf(b))}. One smooth continuous move over ${data.dur} seconds, steady speed, no cuts.`;
  }
  const imagePrompt = () => {
    const l = layout(data.keys[0] || camState());
    return `A photorealistic frame that keeps exactly this layout, camera angle and framing: ${describeStart()}.${l.length ? " In frame: " + l.join("; ") + "." : ""} Replace the grey stand-ins with the real people and products, keep every position, size and the perspective identical.`;
  };

  // ---------- UI wiring ----------
  const say = t => { $q("[data-desc]").textContent = t; };
  function refreshDesc() { say(data.keys.filter(Boolean).length >= 2 ? describeMove() : `${describeStart()}. Frame the first moment, then ① Set start.`); }
  function setLens(mm, quiet) {
    data.mm = mm; shotCam.fov = vfovFor(mm, aspect); shotCam.updateProjectionMatrix();
    root.querySelectorAll("[data-mm]").forEach(b => b.classList.toggle("on", Number(b.dataset.mm) === mm));
    if (!quiet) changed();
  }
  function setMode(m) {
    mode = m; setTimeout(() => tourEvent("mode-" + m), 0);
    root.querySelectorAll("[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === m));
    orbit.object = m === "lens" ? shotCam : dirCam;
    orbit.target.copy(m === "dir" ? dirTarget : lensTarget);
    frameEl.hidden = m !== "lens"; camHelper.visible = camBody.visible = m === "dir";
    select(selected); resize();
  }
  let lensTarget = shotTarget.clone(), dirTarget = new THREE.Vector3(0, 0.8, 0);
  orbit.addEventListener("change", () => { if (mode === "lens") { lensTarget.copy(orbit.target); refreshDesc(); changed(true); } else dirTarget.copy(orbit.target); });
  root.querySelector("[data-v=lens]").onclick = () => setMode("lens");
  root.querySelector("[data-v=dir]").onclick = () => setMode("dir");
  root.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addObj(b.dataset.add));
  root.querySelectorAll("[data-pic]").forEach(b => b.onclick = () => { const p = opts.pictures[Number(b.dataset.pic)]; addObj("card", { img: p.url, label: p.name || "Photo" }); });
  root.querySelectorAll("[data-mm]").forEach(b => b.onclick = () => { setLens(Number(b.dataset.mm)); refreshDesc(); tourEvent("lens"); });
  root.querySelectorAll("[data-tm]").forEach(b => b.onclick = () => { tcontrols.setMode(b.dataset.tm); tcontrols.showY = b.dataset.tm !== "translate" || selKind() !== "person"; root.querySelectorAll("[data-tm]").forEach(x => x.classList.toggle("on", x === b)); });
  const selKind = () => (data.objects.find(o => o.id === selected) || {}).kind;
  $q("[data-label]").oninput = e => { const o = data.objects.find(x => x.id === selected); if (o) { o.label = e.target.value; refreshDesc(); changed(); } };
  const durEl = $q("[data-dur]"); durEl.value = data.dur; $q("[data-durv]").textContent = data.dur + "s";
  durEl.oninput = () => { data.dur = Number(durEl.value); $q("[data-durv]").textContent = data.dur + "s"; refreshDesc(); changed(); };
  root.querySelector("[data-a=del]").onclick = () => { if (!selected) return; scene.remove(meshes.get(selected)); meshes.delete(selected); data.objects = data.objects.filter(o => o.id !== selected); select(null); refreshDesc(); changed(); };
  root.querySelector("[data-a=kstart]").onclick = () => { if (mode !== "lens") setMode("lens"); setKey("start"); say("Start set. Now move the camera (drag to orbit, two fingers / right-drag to slide, pinch / scroll to go closer), then ⚑ Set end."); };
  root.querySelector("[data-a=kend]").onclick = () => { if (mode !== "lens") setMode("lens"); setKey("end"); refreshDesc(); };
  root.querySelector("[data-a=kmid]").onclick = () => { if (mode !== "lens") setMode("lens"); setKey("mid"); refreshDesc(); };
  root.querySelector("[data-a=kclear]").onclick = () => { data.keys = []; drawPath(); renderKeys(); refreshDesc(); changed(); };
  root.querySelector("[data-a=play]").onclick = () => play();
  root.querySelector("[data-a=help]").onclick = () => startTour();
  root.querySelector("[data-a=movetext]").onclick = () => { const t = describeMove(); if (!t) return say("Set a start and an end first."); opts.onMoveText && opts.onMoveText(t, data.dur); close(); };
  root.querySelector("[data-a=frame]").onclick = async () => {
    const k = data.keys[0] || camState();
    const img = await renderStill(k);
    opts.onStartFrame && opts.onStartFrame({ image: img, imagePrompt: imagePrompt(), moveText: describeMove(), dur: data.dur });
    close();
  };
  root.querySelector("[data-a=video]").onclick = async () => {
    if (!curves()) return say("Set a start and an end first, then you can save the move as a preview video.");
    const stream = renderer.domElement.captureStream(30), type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) return say("This browser can't record video.");
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 }), chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    rec.start(); await play(); rec.stop(); await done;
    opts.onSaveVideo && opts.onSaveVideo(new Blob(chunks, { type: type.split(";")[0] }), type.includes("mp4") ? "mp4" : "webm");
  };
  root.querySelector("[data-a=close]").onclick = () => close();
  const onKey = e => { if (e.key === "Escape") { if (tour) return endTour(); close(); } if ((e.key === "Delete" || e.key === "Backspace") && selected && document.activeElement.tagName !== "INPUT") root.querySelector("[data-a=del]").click(); };
  document.addEventListener("keydown", onKey);

  // tap a stand-in to select it (Director view)
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null;
  renderer.domElement.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6 || tcontrols.dragging) return;
    const r = renderer.domElement.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, mode === "lens" ? shotCam : dirCam);
    const hit = ray.intersectObjects([...meshes.values()], true)[0];
    let g = hit && hit.object; while (g && !g.userData.id) g = g.parent;
    if (g) { if (mode === "lens") setMode("dir"); select(g.userData.id); } else if (mode === "dir") select(null);
  });

  // ---------- render ----------
  function resize() {
    const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false);
    dirCam.aspect = w / h; dirCam.updateProjectionMatrix();
    // through the lens: the shot's aspect ratio, letterboxed inside the view
    let fw = w, fh = w / aspect; if (fh > h - 24) { fh = h - 24; fw = fh * aspect; } fw = Math.min(fw, w - 24); fh = fw / aspect;
    Object.assign(frameEl.style, { left: (w - fw) / 2 + "px", top: (h - fh) / 2 + "px", width: fw + "px", height: fh + "px" });
    renderer.__frame = { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
  }
  const ro = new ResizeObserver(resize); ro.observe(view);
  let alive = true;
  function tick(now) {
    if (!alive) return;
    if (playing) { const t = Math.min(1, (now - playing.t0) / playing.ms); applyAt(t); lensTarget.copy(orbit.target); if (t >= 1) { const r = playing.res; playing = null; r(); refreshDesc(); } }
    else orbit.update();
    if (mode === "lens") shotCam.lookAt(orbit.target);
    camBody.position.copy(shotCam.position); camBody.quaternion.copy(shotCam.quaternion); camHelper.update();
    const w = view.clientWidth, h = view.clientHeight;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
    if (mode === "lens") {
      renderer.setClearColor(0x0c0b09); renderer.clear();
      const f = renderer.__frame || { x: 0, y: 0, w, h };
      // render a wider area than the frame (dimmed by the frame's shadow) so you see what's just outside the shot
      const scale = Math.max(w / f.w, h / f.h), cam = shotCam.clone(); cam.aspect = w / h;
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(shotCam.fov) / 2) * (h / f.h))); cam.updateProjectionMatrix();
      renderer.render(scene, cam); void scale;
    } else renderer.render(scene, dirCam);
    if (tour) placeTour();
    requestAnimationFrame(tick);
  }
  async function renderStill(k) {
    const W = 1280, H = Math.round(W / aspect), cam = new THREE.PerspectiveCamera(vfovFor(k.mm, aspect), aspect, 0.05, 200);
    cam.position.copy(v3(k.pos)); cam.lookAt(v3(k.target)); cam.updateProjectionMatrix();
    const vis = [camHelper.visible, camBody.visible, pathLine.visible, keyDots.visible, grid.visible, tHelper.visible];
    camHelper.visible = camBody.visible = pathLine.visible = keyDots.visible = tHelper.visible = false; grid.visible = false;
    const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
    renderer.setRenderTarget(rt); renderer.render(scene, cam);
    const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); renderer.setRenderTarget(null); rt.dispose();
    [camHelper.visible, camBody.visible, pathLine.visible, keyDots.visible, grid.visible, tHelper.visible] = vis;
    const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d"), im = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // flip: GL rows go bottom-up
    ctx.putImageData(im, 0, 0);
    try { return c.toDataURL("image/jpeg", 0.9); } catch { return null; } // a photo card from another site would block this
  }

  // ---------- the guided tour: shown the first time, replayed with “Show me how” ----------
  const TOUR = [
    { title: "Plan a shot like on a real set", text: "The Stage lets you place the camera, pick a lens and plan the move <b>before</b> paying for a single video. It takes about a minute — or load a sample scene to see a finished setup first.", center: true, sample: true },
    { sel: ".stgGrid", title: "1 · Add who and what is in the shot", text: "Tap <b>Person</b>, <b>Bottle</b>, <b>Table</b>… Grey stand-ins appear on the set. Photo cards (your cast and brand photos) work too.", wait: "add", waitText: "Tap one to continue" },
    { sel: ".stgView", title: "2 · Put them in place", text: "Drag the coloured <b>arrows</b> to move what you selected. <b>Turn</b> and <b>Size</b> are on the left. Tap anything on the set to select it; drag the empty floor to look around." },
    { sel: "[data-v=lens]", title: "3 · Look through the camera", text: "Tap <b>🎥 Through the lens</b> to see exactly what the camera films.", wait: "mode-lens", waitText: "Tap it to continue" },
    { sel: ".stgView", title: "4 · Frame the first moment", text: "<b>Drag</b> to circle around the subject · <b>two fingers</b> (or right-drag) to slide · <b>pinch</b> (or scroll) to go closer. The gold box is the frame — what's inside is what gets filmed." },
    { sel: "[data-lenses]", title: "5 · Choose a lens", text: "<b>24mm</b> wide and dramatic · <b>35–50mm</b> natural, like the eye · <b>85mm</b> flattering close-ups with a soft background.", wait: "lens", waitText: "Pick one (or tap Next)", next: true },
    { sel: "[data-a=kstart]", title: "6 · Lock the start", text: "Happy with the first frame? Tap <b>① Set start</b>.", wait: "kstart", waitText: "Tap it to continue" },
    { sel: "[data-a=kend]", title: "7 · Where does the camera end up?", text: "Move the camera to the last frame — closer, around the subject, higher — then tap <b>⚑ Set end</b>.", wait: "kend", waitText: "Move the camera, then tap it" },
    { sel: "[data-a=play]", title: "8 · Watch the move", text: "Tap <b>▶ Play the move</b>. Not right? Move the camera and tap ⚑ Set end again.", wait: "play", waitText: "Tap it to continue" },
    { sel: "[data-desc]", title: "9 · Your move, in camera language", text: "This is what the video model receives — lens, angle, distance and every movement, worked out for you." },
    { sel: "[data-a=frame]", title: "10 · Make it real", text: "<b>Make the start frame</b> turns this grey layout into a real image with your cast and look. Then <b>▶ Animate</b> on that image uses this exact move. That's it!", last: true },
  ];
  let tour = null; // { i, ring, tip }
  function startTour() {
    endTour(); setMode("dir");
    tour = { i: 0, ring: document.createElement("div"), tip: document.createElement("div") };
    tour.ring.className = "stgRing"; tour.tip.className = "stgTip";
    document.body.append(tour.ring, tour.tip); showStep();
  }
  function endTour(done) {
    if (!tour) return; tour.ring.remove(); tour.tip.remove(); tour = null;
    try { localStorage.setItem("illume.stageTour", "1"); } catch {}
    if (done) say("You're set. Tap “▶ Show me how” at the top any time to see the steps again.");
  }
  function showStep() {
    const st = TOUR[tour.i];
    if (st.sel === "[data-a=kend]" || st.sel === "[data-a=kstart]" || st.sel === "[data-lenses]") { if (mode !== "lens") setMode("lens"); }
    tour.tip.innerHTML = `<small>Stage · ${tour.i === 0 ? "welcome" : `step ${tour.i} of ${TOUR.length - 1}`}</small><h4>${st.title}</h4><p>${st.text}</p><div class="row">`
      + (st.sample ? `<button class="stgBtn gold" data-t="next">Show me</button><button class="stgBtn" data-t="sample">Load a sample scene</button>` : "")
      + (!st.sample && tour.i > 0 ? `<button class="stgBtn" data-t="back">Back</button>` : "")
      + (!st.sample && (!st.wait || st.next) ? `<button class="stgBtn gold" data-t="${st.last ? "done" : "next"}">${st.last ? "Got it" : "Next"}</button>` : "")
      + (st.wait && !st.next ? `<span class="wait">${st.waitText}</span>` : st.wait ? `<span class="wait">${st.waitText}</span>` : "")
      + `<span class="sp"></span><button class="skip" data-t="skip">Skip tour</button></div>`;
    tour.tip.querySelectorAll("[data-t]").forEach(b => b.onclick = () => {
      const t = b.dataset.t;
      if (t === "next") { tour.i++; showStep(); }
      else if (t === "back") { tour.i = Math.max(0, tour.i - 1); showStep(); }
      else if (t === "sample") { loadSample(); endTour(); say("A sample scene: a model at a table with a product, and a camera move already set. Tap ▶ Play the move — then change anything you like. “▶ Show me how” walks you through it step by step."); }
      else endTour(t === "done");
    });
    placeTour();
  }
  function tourEvent(name) {
    if (!tour) return; const st = TOUR[tour.i];
    if (st.wait === name) { tour.i++; if (tour.i >= TOUR.length) return endTour(true); setTimeout(() => tour && showStep(), name === "play" ? 900 : 250); }
  }
  function placeTour() {
    const st = TOUR[tour.i], el = st.sel && root.querySelector(st.sel), vw = window.innerWidth, vh = window.innerHeight, tw = tour.tip.offsetWidth, th = tour.tip.offsetHeight;
    if (!el || st.center) { tour.ring.className = "stgRing none"; Object.assign(tour.ring.style, { left: vw / 2 + "px", top: vh / 2 + "px", width: "0px", height: "0px" }); Object.assign(tour.tip.style, { left: (vw - tw) / 2 + "px", top: Math.max(12, (vh - th) / 2) + "px" }); return; }
    const r = el.getBoundingClientRect(), pad = 6, big = r.width > vw * 0.5;
    tour.ring.className = "stgRing";
    Object.assign(tour.ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    let left, top;
    if (big) { left = r.left + 20; top = r.top + 64; } // over the 3D view: sit in its corner
    else if (r.right + 16 + tw < vw) { left = r.right + 16; top = r.top; }
    else if (r.bottom + 12 + th < vh) { left = r.left; top = r.bottom + 12; }
    else { left = r.left; top = r.top - th - 12; }
    Object.assign(tour.tip.style, { left: Math.max(12, Math.min(vw - tw - 12, left)) + "px", top: Math.max(12, Math.min(vh - th - 12, top)) + "px" });
  }
  function loadSample() {
    meshes.forEach(g => scene.remove(g)); meshes.clear(); select(null);
    const id = () => uid();
    data.objects = [
      { id: id(), kind: "wall", label: "Wall", pos: [0, 0, -1.8], rotY: 0, scale: 1 },
      { id: id(), kind: "table", label: "Table", pos: [0, 0, 0], rotY: 0, scale: 1 },
      { id: id(), kind: "bottle", label: "The product", pos: [0.15, 0.75, 0.05], rotY: 0, scale: 1 },
      { id: id(), kind: "person", label: "Model", pos: [-0.35, 0, -0.85], rotY: 0.3, scale: 1 },
    ];
    data.objects.forEach(o => meshes.set(o.id, build(o)));
    data.mm = 35; data.dur = 6; durEl.value = 6; $q("[data-durv]").textContent = "6s";
    data.keys = [{ pos: [0.2, 1.25, 3.2], target: [0, 1.0, 0], mm: 35 }, { pos: [1.3, 1.05, 1.15], target: [0.1, 0.85, 0], mm: 50 }];
    jumpTo(0); drawPath(); renderKeys(); refreshDesc(); changed();
  }

  let saveT = null;
  function changed(light) { clearTimeout(saveT); saveT = setTimeout(() => { syncFromMeshes(); data.cam = { pos: arr(shotCam.position), target: arr(lensTarget) }; opts.onChange && opts.onChange(JSON.parse(JSON.stringify(data))); }, light ? 800 : 300); }
  function close() {
    if (!alive) return; alive = false; changed(); clearTimeout(saveT);
    syncFromMeshes(); data.cam = { pos: arr(shotCam.position), target: arr(lensTarget) }; opts.onChange && opts.onChange(JSON.parse(JSON.stringify(data)));
    endTour(); document.removeEventListener("keydown", onKey); ro.disconnect(); orbit.dispose(); tcontrols.dispose(); renderer.dispose(); root.remove();
    opts.onClose && opts.onClose();
  }

  setLens(data.mm, true); setMode("lens"); drawPath(); renderKeys(); refreshDesc(); resize(); requestAnimationFrame(tick);
  if (!data.keys.length) say("Drag to frame the shot like a camera operator. Pick a lens, then ① Set start. Tap “▶ Show me how” for the steps.");
  let seen = false; try { seen = localStorage.getItem("illume.stageTour") === "1"; } catch {}
  if (!seen && !opts.noTour) setTimeout(startTour, 400); // the first time: a guided tour
  return { close, describeMove, imagePrompt };
}
function an(w) { return (/^[aeiou]/i.test(w) ? "an " : "a ") + w; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
