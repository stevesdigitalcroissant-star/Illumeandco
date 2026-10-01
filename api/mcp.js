// Illume Studio as an MCP server — create from Claude.
//
// Claude (claude.ai → Settings → Connectors → Add custom connector) uses the URL
//   https://<domain>/mcp
// and signs in through the OAuth flow below (you approve on a Studio page).
// Claude Code / Desktop can instead send a personal token as
//   Authorization: Bearer <token>    (made in the Studio's Settings → Claude).
//
// Routes (vercel.json rewrites /mcp and the two /.well-known paths here):
//   POST /api/mcp                       JSON-RPC: initialize, tools/list, tools/call, ping
//   GET  /api/mcp?wk=prm | wk=as        OAuth discovery documents
//   POST /api/mcp?oauth=register        dynamic client registration (stateless)
//   GET  /api/mcp?oauth=authorize       sign-in + "Allow Claude" page
//   POST /api/mcp?oauth=approve         the page's Allow button
//   POST /api/mcp?oauth=token           code → tokens, refresh → tokens
//   POST /api/mcp?oauth=pat             (signed-in) make a personal token
//   POST /api/mcp?oauth=revoke          (signed-in) revoke every Claude token
//
// Takes made from Claude are written to the account's "il.mcp" record; the
// Studio page merges them into the right client/project the next time it's open.
const { createHmac, createHash, timingSafeEqual } = require("crypto");
const db = require("./_db");
const C = require("./_credits");
const { atlas, PUBLIC_BASE } = require("./_atlas");
const { startJob } = require("./_gen");
const { keepUrl } = require("./_keep");

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const KEY = () => createHash("sha256").update("illume-mcp:" + (process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "")).digest();
const sign = obj => { const b = Buffer.from(JSON.stringify(obj)).toString("base64url"); return b + "." + createHmac("sha256", KEY()).update(b).digest("base64url"); };
function unsign(tok) {
  const [b, s] = String(tok || "").split(".");
  if (!b || !s) return null;
  const good = Buffer.from(createHmac("sha256", KEY()).update(b).digest("base64url")), given = Buffer.from(s);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try { const o = JSON.parse(Buffer.from(b, "base64url").toString()); return o.exp && o.exp < Date.now() ? null : o; } catch { return null; }
}
const origin = req => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
const tokenVersion = async name => { const r = await db.readJson(`mcp/${db.fileKey(name)}.json`).catch(() => null); return (r && r.value && r.value.v) || 1; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const body = req => { let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = Object.fromEntries(new URLSearchParams(b)); } } return b || {}; };

// ---------- the account's studio data ----------
const dataPath = user => `data/${db.fileKey(user.name)}.json`;
// Claude's takes live in their own file (mcpdata/<user>.json), so a write from
// Claude can never race with — and overwrite — a save from an open Studio tab.
const mcpPath = user => `mcpdata/${db.fileKey(user.name)}.json`;
async function readData(user) {
  const [r, m] = await Promise.all([db.readJson(dataPath(user)), db.readJson(mcpPath(user)).catch(() => null)]);
  const d = (r && r.value) || {};
  d["il.mcp"] = (m && m.value) || { takes: {}, ops: [] };
  return d;
}
async function updateMcp(user, fn) {
  const r = await db.readJson(mcpPath(user)).catch(() => null);
  const m = Object.assign({ takes: {}, ops: [] }, (r && r.value) || {});
  const out = await fn(m);
  const ids = Object.keys(m.takes); if (ids.length > 100) ids.sort((a, b) => (m.takes[a].started || 0) - (m.takes[b].started || 0)).slice(0, ids.length - 100).forEach(k => delete m.takes[k]);
  m.ops = (m.ops || []).slice(-100);
  await db.writeJson(mcpPath(user), m);
  return out;
}
const norm = s => String(s || "").trim().toLowerCase();
function resolveTarget(d, clientName, projectName) {
  const clients = d["il.clients"] || [], projects = d["il.projects"] || [];
  const curProj = projects.find(p => p.id === d["il.proj"]) || projects[0];
  let c = clientName ? clients.find(x => norm(x.name) === norm(clientName)) : clients.find(x => curProj && x.id === curProj.client);
  if (clientName && !c) c = clients.find(x => norm(x.name).includes(norm(clientName)));
  if (!c) c = clients[0];
  if (!c) return { error: "No clients yet — open the Studio once to set one up." };
  const mine = projects.filter(p => p.client === c.id);
  let p = projectName ? mine.find(x => norm(x.name) === norm(projectName)) || mine.find(x => norm(x.name).includes(norm(projectName))) : (curProj && curProj.client === c.id ? curProj : mine[0]);
  if (!p) return { error: `“${c.name}” has no project called “${projectName}”. Its projects: ${mine.map(x => x.name).join(", ") || "none"}.` };
  return { client: c, project: p };
}
const allTakes = d => {
  const m = (d["il.mcp"] && d["il.mcp"].takes) || {};
  const map = new Map((d["il.hist"] || []).map(h => [h.id, h]));
  Object.values(m).forEach(t => { const h = map.get(t.id); if (!h || (h.status === "running" && t.status !== "running")) map.set(t.id, { ...h, ...t }); });
  return [...map.values()].sort((a, b) => (b.at || b.started || 0) - (a.at || a.started || 0));
};

// ---------- tools ----------
const CAM = { "dolly in": "slow dolly-in toward the subject", "dolly out": "slow dolly-out revealing the scene", orbit: "smooth 180° orbit around the subject", "crane up": "crane shot rising up and over the scene", tracking: "tracking shot moving alongside the subject", handheld: "subtle handheld camera, documentary feel", "macro push-in": "macro push-in on the product details", static: "locked-off static camera", "slow motion": "slow motion, 120fps feel", "whip pan": "fast whip pan transition" };
const DEFAULT_MODEL = { image: "google/nano-banana-pro/text-to-image", video: "bytedance/seedance-2.5/text-to-video", audio: "bytedance/seed-audio-1.0" };
const MODELS = {
  image: [["google/nano-banana-pro/text-to-image", "Nano Banana Pro — brand-consistent edits from a reference photo"], ["bytedance/seedream-v5.0-pro/text-to-image", "Seedream 5.0 Pro — highest realism, hero shots"], ["openai/gpt-image-2/text-to-image", "GPT Image 2 — legible text in the image"]],
  video: [["bytedance/seedance-2.5/text-to-video", "Seedance 2.5 — cinematic camera moves"], ["bytedance/seedance-2.0/text-to-video", "Seedance 2.0 — cheaper draft tier"]],
  audio: [["bytedance/seed-audio-1.0", "Seed Audio — voiceover / narration"]],
};
const TOOLS = [
  { name: "list_clients", description: "List the Studio's clients and their projects (with brand style notes and how many takes each has). Use the names with create_take.", inputSchema: { type: "object", properties: {} } },
  { name: "create_take", description: "Generate an image, video or voiceover in Illume Studio, filed under a client and project. Returns a take id; then call check_take until it's done. Members pay in credits.", inputSchema: { type: "object", required: ["prompt"], properties: {
    prompt: { type: "string", description: "What to make. For video: describe the motion and the camera." },
    mode: { type: "string", enum: ["image", "video", "audio"], default: "image" },
    client: { type: "string", description: "Client name (as in list_clients). Defaults to the one open in the Studio." },
    project: { type: "string", description: "Project name within that client. Defaults to the client's current/first project." },
    model: { type: "string", description: "Atlas model id (see list_models). Defaults: Nano Banana Pro (image), Seedance 2.5 (video)." },
    aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:5", "4:3", "3:4", "21:9"], description: "Frame shape. Ignored for video with a start image (it follows the image)." },
    quality: { type: "string", enum: ["1k", "2k", "4k", "720p", "1080p"], description: "Image: 1k/2k/4k. Video: 720p/1080p/2k/4k." },
    duration_seconds: { type: "integer", minimum: 4, maximum: 15, description: "Video length." },
    sound: { type: "boolean", description: "Video: generate music/effects/speech (default true)." },
    camera_move: { type: "string", enum: Object.keys(CAM), description: "Video camera direction, added to the prompt." },
    reference_image_urls: { type: "array", items: { type: "string" }, description: "https image URLs. Image: references for edit models. Video: the first one is the start frame." },
    use_brand_style: { type: "boolean", description: "Put the client's brand-kit style notes in front of the prompt (default true)." },
    count: { type: "integer", minimum: 1, maximum: 4, description: "How many variations (default 1)." },
  } } },
  { name: "check_take", description: "Check a take made with create_take. Waits up to ~40s. When finished it's saved permanently in the Studio; images are returned so you can see them.", inputSchema: { type: "object", required: ["take_id"], properties: { take_id: { type: "string" }, wait_seconds: { type: "integer", minimum: 0, maximum: 45, default: 40 } } } },
  { name: "list_takes", description: "Recent takes (newest first), optionally for one client/project.", inputSchema: { type: "object", properties: { client: { type: "string" }, project: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50, default: 15 } } } },
  { name: "add_to_storyboard", description: "Add a finished take to its project's storyboard (as the next shot).", inputSchema: { type: "object", required: ["take_id"], properties: { take_id: { type: "string" } } } },
  { name: "get_credits", description: "How many credits you have (or, for the studio owner, the Atlas Cloud balance).", inputSchema: { type: "object", properties: {} } },
  { name: "list_models", description: "The pinned models for image, video and voice.", inputSchema: { type: "object", properties: {} } },
];
const text = t => ({ content: [{ type: "text", text: t }] });
const fail = t => ({ content: [{ type: "text", text: t }], isError: true });

async function callTool(user, req, name, a) {
  const key = String(process.env.ATLASCLOUD_API_KEY || "").trim();
  const site = origin(req);
  if (name === "list_models") return text(Object.entries(MODELS).map(([m, list]) => `${m.toUpperCase()}\n` + list.map(([id, d]) => `• ${id} — ${d}`).join("\n")).join("\n\n"));
  if (name === "get_credits") {
    if (user.role === "owner") {
      try { const out = await atlas("/balance", key, {}, PUBLIC_BASE); const d = out?.data || out; const v = d.available?.value ?? d.cash?.value ?? d.value; return text(`You're the studio owner — you don't use credits. Atlas Cloud balance: $${Number(v).toFixed(2)}.`); }
      catch (e) { return fail("Couldn't read the Atlas balance: " + e.message); }
    }
    if (!C.enabled()) return text("Credits aren't switched on — generations are free on this studio.");
    const w = await C.getWallet(user.name); return text(`You have ${w.credits.toLocaleString()} credits. Buy more in the Studio: ${site}/generation (Settings → Credits).`);
  }
  const d = await readData(user);
  if (name === "list_clients") {
    const clients = d["il.clients"] || [], projects = d["il.projects"] || [], takes = allTakes(d);
    if (!clients.length) return text("No clients yet — open the Studio once to set one up.");
    return text(clients.map(c => `• ${c.name}${c.style ? ` — style: “${String(c.style).slice(0, 100)}”` : ""}\n` + projects.filter(p => p.client === c.id).map(p => `    – ${p.name} (${takes.filter(t => t.proj === p.id && t.status !== "failed").length} takes${p.board && p.board.length ? `, ${p.board.length} in storyboard` : ""})`).join("\n")).join("\n"));
  }
  if (name === "list_takes") {
    let takes = allTakes(d);
    if (a.client || a.project) { const t = resolveTarget(d, a.client, a.project); if (t.error) return fail(t.error); takes = takes.filter(x => (a.project ? x.proj === t.project.id : x.client === t.client.id)); }
    const projects = d["il.projects"] || [], clients = d["il.clients"] || [];
    const lim = Math.min(50, a.limit || 15);
    if (!takes.length) return text("No takes yet.");
    return text(takes.slice(0, lim).map(t => { const p = projects.find(x => x.id === t.proj), c = clients.find(x => x.id === (t.client || (p && p.client))); return `• ${t.id} · ${t.status || "done"} · ${t.mode} · ${c ? c.name : "?"} / ${p ? p.name : "?"} · ${new Date(t.at || t.started || 0).toISOString().slice(0, 16).replace("T", " ")} — ${String(t.userPrompt || t.prompt || "").slice(0, 90)}`; }).join("\n"));
  }
  if (name === "add_to_storyboard") {
    const t = allTakes(d).find(x => x.id === a.take_id); if (!t) return fail("No take with that id.");
    if (t.status && t.status !== "done") return fail("That take isn't finished yet — only finished takes go in the storyboard.");
    await updateMcp(user, m => { m.ops.push({ id: "op" + Date.now(), type: "board", proj: t.proj, take: t.id }); });
    return text("Added — it appears as the next shot in the project's storyboard when the Studio is open.");
  }
  if (name === "create_take") {
    if (!key) return fail("The studio's Atlas Cloud key isn't set up.");
    const mode = ["image", "video", "audio"].includes(a.mode) ? a.mode : "image";
    const tgt = resolveTarget(d, a.client, a.project); if (tgt.error) return fail(tgt.error);
    let userPrompt = String(a.prompt || "").trim(); if (!userPrompt) return fail("Write a prompt.");
    if (mode === "video" && a.camera_move && CAM[a.camera_move]) userPrompt = userPrompt.replace(/[.,]\s*$/, "") + ", " + CAM[a.camera_move];
    const style = (tgt.client.style || "").trim();
    const prompt = (a.use_brand_style !== false && style && mode !== "audio") ? style + ". " + userPrompt : userPrompt;
    const refs = (Array.isArray(a.reference_image_urls) ? a.reference_image_urls : []).filter(u => /^https:\/\//i.test(u)).slice(0, 10);
    const params = {};
    if (mode === "image") { if (a.aspect_ratio) params.aspect_ratio = a.aspect_ratio; params.resolution = /^(1k|2k|4k)$/.test(a.quality) ? a.quality : "2k"; }
    if (mode === "video") {
      if (a.aspect_ratio && !refs.length) params.ratio = a.aspect_ratio;
      params.resolution = /^(720p|1080p|2k|4k)$/.test(a.quality) ? a.quality : "1080p";
      if (a.duration_seconds) params.duration = Math.round(a.duration_seconds);
      params.generate_audio = a.sound !== false;
    }
    const model = a.model || DEFAULT_MODEL[mode];
    const n = Math.max(1, Math.min(4, a.count || 1)), made = [];
    for (let i = 0; i < n; i++) {
      try {
        const out = await startJob(user, key, { mode, model, prompt, image_url: mode === "video" ? refs.slice(0, 1) : refs, params });
        made.push({ id: out.id, cost: out.cost || 0 });
      } catch (e) { if (!made.length) return fail(e.message); break; }
    }
    const now = Date.now();
    await updateMcp(user, m => { made.forEach(x => { m.takes[x.id] = { id: x.id, mode, model, prompt, userPrompt, params, ref: refs, proj: tgt.project.id, client: tgt.client.id, started: now, status: "running", via: "claude" }; }); });
    const cost = made.reduce((t, x) => t + x.cost, 0);
    return text(`Started ${made.length} ${mode} take${made.length > 1 ? "s" : ""} for ${tgt.client.name} / ${tgt.project.name}${cost ? ` (${cost.toLocaleString()} credits)` : ""}.\nTake id${made.length > 1 ? "s" : ""}: ${made.map(x => x.id).join(", ")}\n${mode === "video" ? "Videos take 1–3 minutes — " : ""}Call check_take with the id to get the result.${refs.length && mode === "video" && a.aspect_ratio ? "\nNote: with a start image the video follows the image's shape." : ""}`);
  }
  if (name === "check_take") {
    const id = String(a.take_id || ""); const known = allTakes(d).find(x => x.id === id);
    if (!known) return fail("No take with that id.");
    if (known.status === "done" && /^\/api\/file/.test(known.url || "")) return text(`Done and saved. Open it in the Studio: ${site}/generation`);
    const until = Date.now() + Math.min(45, a.wait_seconds ?? 40) * 1000;
    let s;
    for (;;) {
      try { const out = await atlas(`/model/prediction/${encodeURIComponent(id)}`, String(process.env.ATLASCLOUD_API_KEY || "")); s = out?.data || out; }
      catch (e) { if (/returned 4\d\d/.test(e.message)) s = { status: "failed", error: e.message }; else return fail("Couldn't reach Atlas: " + e.message); }
      if (["completed", "succeeded", "failed", "canceled"].includes(s.status) || Date.now() > until) break;
      await new Promise(r => setTimeout(r, 3000));
    }
    const raw = [s.outputs, s.output, s.urls, s.images, s.videos, s.video_url, s.image_url, s.url].find(v => v && (!Array.isArray(v) || v.length));
    const url = [].concat(raw || []).map(o => (typeof o === "string" ? o : o && (o.url || o.download_url))).find(u => /^https?:\/\//.test(u || ""));
    if ((s.status === "completed" || s.status === "succeeded") && url) {
      let kept = null; try { kept = await keepUrl(user, url, id); } catch (e) { console.log("mcp keep failed:", e.message); }
      await updateMcp(user, m => { const t = m.takes[id] || { ...known }; Object.assign(t, { status: "done", url: kept ? "/api/file?p=" + encodeURIComponent(kept.path) : url, src: url, at: Date.now(), keptAt: kept ? Date.now() : undefined }); m.takes[id] = t; });
      const out = [{ type: "text", text: `Done — saved permanently in ${site}/generation under its client and project.${known.mode === "video" ? ` Video preview (expires in a few days): ${url}` : ""}` }];
      if (known.mode === "image") { try { const r = await fetch(url); const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 4.5e6) out.push({ type: "image", data: buf.toString("base64"), mimeType: (r.headers.get("content-type") || "image/png").split(";")[0] }); } catch {} }
      return { content: out };
    }
    if (["failed", "canceled", "completed", "succeeded"].includes(s.status)) {
      if (C.pays(user)) await C.withWallet(user.name, w => { const n = w.holds && w.holds[id]; if (!n) return; delete w.holds[id]; w.credits += n; C.entry(w, "refund", n, "Take failed — refunded"); }).catch(() => {});
      await updateMcp(user, m => { const t = m.takes[id] || { ...known }; Object.assign(t, { status: "failed", error: s.error || "Generation failed", at: Date.now() }); m.takes[id] = t; });
      return fail(`The take failed: ${s.error || "no file came back"}.${C.pays(user) ? " Its credits were refunded." : ""}`);
    }
    return text(`Still ${s.status || "rendering"}… call check_take again in a moment.`);
  }
  return fail("Unknown tool: " + name);
}

// ---------- OAuth pages ----------
function page(res, title, inner) {
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Content-Security-Policy", "frame-ancestors 'none'"); // no clickjacking the Allow button
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0C0B09;color:#F3EDE2;font:15px/1.5 system-ui,sans-serif;padding:16px}
.card{width:min(420px,100%);background:#15130F;border:1px solid rgba(255,236,200,.16);border-radius:22px;padding:28px;box-shadow:0 40px 90px -30px #000}
h1{font:300 28px Georgia,serif;margin:0 0 6px;display:flex;gap:10px;align-items:center}h1:before{content:"";width:11px;height:11px;border-radius:50%;background:#E8B54B;box-shadow:0 0 14px #E8B54B}
p{color:#B4AA9A;margin:8px 0 16px}label{display:block;font-size:12px;color:#B4AA9A;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.06em}
input{width:100%;box-sizing:border-box;background:#100E0B;border:1px solid rgba(255,236,200,.14);border-radius:12px;padding:11px 13px;color:#F3EDE2;font:inherit}
button{width:100%;margin-top:16px;border:0;border-radius:14px;padding:14px;font:700 15px system-ui;color:#1A1408;background:linear-gradient(180deg,#F5D58A,#E8B54B);cursor:pointer}
.ghost{background:transparent;color:#B4AA9A;border:1px solid rgba(255,236,200,.16);margin-top:8px}.err{color:#F07A6E}ul{color:#B4AA9A;padding-left:18px}</style></head><body><div class="card">${inner}</div></body></html>`);
}

module.exports = async (req, res) => {
  const site = origin(req);
  const q = req.query || {};
  // discovery
  if (q.wk === "prm") return res.status(200).json({ resource: `${site}/mcp`, authorization_servers: [site], bearer_methods_supported: ["header"], resource_name: "Illume Studio" });
  if (q.wk === "as") return res.status(200).json({ issuer: site, authorization_endpoint: `${site}/api/mcp?oauth=authorize`, token_endpoint: `${site}/api/mcp?oauth=token`, registration_endpoint: `${site}/api/mcp?oauth=register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["studio"] });

  if (q.oauth === "register") {
    const b = body(req); const uris = (b.redirect_uris || []).filter(u => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u));
    if (!uris.length) return res.status(400).json({ error: "invalid_redirect_uri" });
    const client_id = sign({ r: uris, n: String(b.client_name || "Claude").slice(0, 60), typ: "client" });
    return res.status(201).json({ client_id, client_name: b.client_name || "Claude", redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" });
  }
  if (q.oauth === "authorize" || q.oauth === "approve") {
    const src = q.oauth === "approve" ? body(req) : q;
    const client = unsign(src.client_id);
    if (!client || client.typ !== "client" || !client.r.includes(src.redirect_uri)) return page(res, "Illume Studio", `<h1>Illume Studio</h1><p class="err">This connection request isn't valid. Remove the connector in Claude and add it again.</p>`);
    if (!src.code_challenge || (src.code_challenge_method || "S256") !== "S256") return page(res, "Illume Studio", `<h1>Illume Studio</h1><p class="err">Unsupported sign-in method.</p>`);
    const user = db.currentUser(req);
    if (q.oauth === "approve" && req.method === "POST") {
      if (!user) return page(res, "Illume Studio", `<h1>Illume Studio</h1><p class="err">Your sign-in expired — try connecting again.</p>`);
      const back = new URL(src.redirect_uri);
      if (src.deny) { back.searchParams.set("error", "access_denied"); if (src.state) back.searchParams.set("state", src.state); res.statusCode = 302; res.setHeader("Location", back.toString()); return res.end(); }
      const code = sign({ typ: "code", u: user.name, role: user.role, cc: src.code_challenge || "", ru: src.redirect_uri, cid: String(src.client_id).slice(0, 40), exp: Date.now() + 5 * 60e3, v: await tokenVersion(user.name) });
      back.searchParams.set("code", code); if (src.state) back.searchParams.set("state", src.state);
      res.statusCode = 302; res.setHeader("Location", back.toString()); return res.end();
    }
    const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method"].map(k => `<input type="hidden" name="${k}" value="${esc(src[k] || "")}">`).join("");
    if (!user) {
      const next = `/api/mcp?${new URLSearchParams(Object.fromEntries(["oauth", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method"].map(k => [k, k === "oauth" ? "authorize" : (src[k] || "")])))}`;
      return page(res, "Sign in — Illume Studio", `<h1>Illume Studio</h1><p>Sign in to connect <b>${esc(client.n)}</b> to your studio.</p>
<form method="post" action="/api/mcp?oauth=login"><input type="hidden" name="next" value="${esc(next)}"><label>Email or username</label><input name="username" autocomplete="username" required><label>Password</label><input name="password" type="password" autocomplete="current-password" required><button>Sign in</button></form>`);
    }
    return page(res, "Allow access — Illume Studio", `<h1>Illume Studio</h1><p><b>${esc(client.n)}</b> wants to create in your studio as <b>${esc(user.name)}</b>. It will be able to:</p>
<ul><li>see your clients, projects and takes</li><li>make images, videos and voiceovers${C.pays(user) ? " (using your credits)" : ""}</li><li>add takes to storyboards</li></ul>
<form method="post" action="/api/mcp?oauth=approve">${hidden}<button>Allow</button><button class="ghost" name="deny" value="1">Cancel</button></form>`);
  }
  if (q.oauth === "login" && req.method === "POST") {
    const b = body(req); const name = db.cleanName(b.username);
    const next = String(b.next || ""); const safeNext = next.startsWith("/api/mcp?oauth=authorize") ? next : "/generation";
    const u = name && await db.getUser(name);
    if (!u || !(await db.passwordMatches(String(b.password || ""), u))) return page(res, "Sign in — Illume Studio", `<h1>Illume Studio</h1><p class="err">Wrong username or password.</p><form method="get" action="${esc(safeNext.split("?")[0])}">${[...new URLSearchParams(safeNext.split("?")[1] || "")].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("")}<button>Try again</button></form>`);
    db.startSession(res, { name, role: u.role || "member" });
    res.statusCode = 302; res.setHeader("Location", safeNext); return res.end();
  }
  if (q.oauth === "token") {
    const b = body(req);
    const issue = async (u, role) => {
      const v = await tokenVersion(u);
      return res.status(200).json({ access_token: sign({ typ: "at", u, role, v, exp: Date.now() + 7 * 864e5 }), token_type: "Bearer", expires_in: 7 * 86400, refresh_token: sign({ typ: "rt", u, role, v, exp: Date.now() + 180 * 864e5 }), scope: "studio" });
    };
    if (b.grant_type === "authorization_code") {
      const c = unsign(b.code);
      if (!c || c.typ !== "code" || c.ru !== b.redirect_uri) return res.status(400).json({ error: "invalid_grant" });
      if (c.cc) { const h = createHash("sha256").update(String(b.code_verifier || "")).digest("base64url"); if (h !== c.cc) return res.status(400).json({ error: "invalid_grant", error_description: "PKCE check failed" }); }
      if (c.v !== await tokenVersion(c.u)) return res.status(400).json({ error: "invalid_grant" });
      return issue(c.u, c.role);
    }
    if (b.grant_type === "refresh_token") {
      const r = unsign(b.refresh_token);
      if (!r || r.typ !== "rt" || r.v !== await tokenVersion(r.u)) return res.status(400).json({ error: "invalid_grant" });
      return issue(r.u, r.role);
    }
    return res.status(400).json({ error: "unsupported_grant_type" });
  }
  if (q.oauth === "pat" || q.oauth === "revoke") {
    const user = await db.requireUser(req, res); if (!user) return;
    if (q.oauth === "revoke") { const v = (await tokenVersion(user.name)) + 1; await db.writeJson(`mcp/${db.fileKey(user.name)}.json`, { v }); return res.status(200).json({ ok: true }); }
    return res.status(200).json({ token: sign({ typ: "pat", u: user.name, role: user.role, v: await tokenVersion(user.name), exp: Date.now() + 365 * 864e5 }), url: `${site}/mcp` });
  }

  // ---------- MCP (JSON-RPC over HTTP) ----------
  if (req.method === "GET") { res.statusCode = 405; res.setHeader("Allow", "POST"); return res.end(); }
  if (req.method !== "POST") return res.status(405).end();
  const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const tok = unsign(auth);
  const user = tok && (tok.typ === "at" || tok.typ === "pat") && tok.v === await tokenVersion(tok.u) ? { name: tok.u, role: tok.role } : null;
  if (!user) {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${site}/.well-known/oauth-protected-resource"`);
    return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Sign in to Illume Studio to use this connector." }, id: null });
  }
  const msg = body(req);
  const one = async m => {
    if (!m || m.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
    if (m.id === undefined) return null; // notification
    try {
      if (m.method === "initialize") return { jsonrpc: "2.0", id: m.id, result: { protocolVersion: VERSIONS.includes(m.params && m.params.protocolVersion) ? m.params.protocolVersion : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "illume-studio", title: "Illume Studio", version: "1.0.0" }, instructions: "Create images, videos and voiceovers in Illume Studio, filed by client and project. Use list_clients first, then create_take, then check_take until it's done." } };
      if (m.method === "ping") return { jsonrpc: "2.0", id: m.id, result: {} };
      if (m.method === "tools/list") return { jsonrpc: "2.0", id: m.id, result: { tools: TOOLS } };
      if (m.method === "tools/call") return { jsonrpc: "2.0", id: m.id, result: await callTool(user, req, m.params && m.params.name, (m.params && m.params.arguments) || {}) };
      return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } };
    } catch (e) { console.log("mcp error:", e.message); return { jsonrpc: "2.0", id: m.id, result: fail("Something went wrong: " + e.message) }; }
  };
  if (Array.isArray(msg)) { const out = (await Promise.all(msg.map(one))).filter(Boolean); return out.length ? res.status(200).json(out) : res.status(202).end(); }
  const out = await one(msg);
  if (!out) return res.status(202).end();
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(out);
};
