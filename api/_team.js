// Teams: one shared studio for several people.
//
// The person who creates the team is its lead. Their own studio becomes the
// team's studio: everyone in the team sees and works on the same clients,
// projects, takes, storyboards, cast and saved prompts (data/<lead>.json), and
// generations are paid from the lead's credits — one shared pot.
//
//   GET  /api/studio?fn=team                         → { team } (null when on your own)
//   POST /api/studio?fn=team { action:"create", name }
//   POST … { action:"invite", role:"editor"|"viewer" } (lead) → { link }   one-time, 7 days
//   POST … { action:"join", code, bring }             → join; bring:true copies your work in
//   POST … { action:"role", member, role }            (lead)
//   POST … { action:"remove", member }                (lead)
//   POST … { action:"leave" }                         (member)
//   POST … { action:"rename", name }                  (lead)
//
// Files: teams/<lead>.json → { name, lead, members:[{name, role, joined}], past:[names] }
//        invites/<code>.json → { lead, role, created }
//        users/<name>.json gains { team: <lead>, teamRole } for members.
const { randomBytes } = require("crypto");
const db = require("./_db");

let blob = null;
try { blob = require("@vercel/blob"); } catch {}

const teamPath = lead => `teams/${db.fileKey(lead)}.json`;
const readTeam = async lead => { const r = await db.readJson(teamPath(lead)).catch(() => null); return (r && r.value) || null; };
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const ROLES = ["editor", "viewer"];

// fileKey back to a name (~40 → @), for "whose file is this?"
const nameFromKey = k => String(k || "").replace(/~([0-9a-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// Who is this person working for? Cached briefly per server instance.
//   { space: name whose studio they work in, teamRole: "lead"|"editor"|"viewer"|null, payer: {name, role} }
const cache = new Map();
async function ctx(user) {
  const name = typeof user === "string" ? user : user.name;
  const hit = cache.get(name); if (hit && Date.now() - hit.t < 120000) return hit.v; // 2 min: team changes call forget()
  const r = await db.readJson(`users/${db.fileKey(name)}.json`).catch(() => null);
  const u = (r && r.value) || {};
  let v;
  if (u.team && u.team !== name) {
    const lead = await db.readJson(`users/${db.fileKey(u.team)}.json`).catch(() => null);
    v = { space: u.team, teamRole: ROLES.includes(u.teamRole) ? u.teamRole : "editor", payer: { name: u.team, role: (lead && lead.value && lead.value.role) || "member" } };
  } else {
    v = { space: name, teamRole: u.lead ? "lead" : null, payer: { name, role: u.role || "member" } };
  }
  cache.set(name, { t: Date.now(), v });
  return v;
}
const forget = name => cache.delete(name);

// May `me` read a file that lives under media/<key>/… ?
async function canReadMedia(me, path) {
  const m = /^media\/([^/]+)\//.exec(String(path || "")); if (!m || path.includes("..")) return false;
  const ownerName = nameFromKey(m[1]);
  if (ownerName === me.name) return true;
  const [mine, theirs] = await Promise.all([ctx(me), ctx(ownerName)]);
  if (mine.space === theirs.space) return true;
  if (mine.space !== me.name || mine.teamRole === "lead") { // someone who left the team still leaves their takes behind
    const t = await readTeam(mine.space);
    return !!(t && (t.past || []).includes(ownerName));
  }
  return false;
}

// A short lock so two saves to the same file can't overwrite each other.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withLock(key, fn) {
  const lock = `locks/${key}`;
  for (let i = 0; ; i++) {
    try { await db.writeJson(lock, { at: Date.now() }, { overwrite: false }); break; }
    catch (e) {
      if (!db.alreadyExists(e)) throw e;
      const cur = await db.readJson(lock).catch(() => null);
      if (cur && cur.value && Date.now() - cur.value.at > 15000) { await blob.del(lock).catch(() => {}); continue; }
      if (i > 60) throw new Error("The studio is busy saving — try again in a moment.");
      await sleep(120 + Math.random() * 180);
    }
  }
  try { return await fn(); } finally { await blob.del(lock).catch(() => {}); }
}

async function setUserTeam(name, team, teamRole) {
  const p = `users/${db.fileKey(name)}.json`, r = await db.readJson(p);
  if (!r || !r.value) return;
  const v = { ...r.value };
  if (team) { v.team = team; v.teamRole = teamRole; } else { delete v.team; delete v.teamRole; }
  await db.writeJson(p, v); forget(name);
}
async function setLead(name, on) {
  const p = `users/${db.fileKey(name)}.json`, r = await db.readJson(p);
  if (!r || !r.value) return;
  const v = { ...r.value }; if (on) v.lead = true; else delete v.lead;
  await db.writeJson(p, v); forget(name);
}

// Copy a joining member's own clients, projects and takes into the team's studio.
const SHARED = ["il.clients", "il.projects", "il.hist", "il.presets", "il.trash", "il.spend"];
async function bringWork(member, lead) {
  const mine = await db.readJson(`data/${db.fileKey(member)}.json`).catch(() => null);
  const src = (mine && mine.value) || {};
  if (!SHARED.some(k => Array.isArray(src[k]) && src[k].length)) return 0;
  let n = 0;
  await withLock(`data-${db.fileKey(lead)}`, async () => {
    const r = await db.readJson(`data/${db.fileKey(lead)}.json`).catch(() => null);
    const data = (r && r.value) || {};
    for (const k of SHARED) {
      const add = Array.isArray(src[k]) ? src[k] : []; if (!add.length) continue;
      const cur = Array.isArray(data[k]) ? data[k] : [], have = new Set(cur.map(x => x && x.id));
      const names = new Set(cur.map(x => x && x.name));
      const fresh = add.filter(x => x && x.id && !have.has(x.id)).map(x => (k === "il.hist" && !x.by ? { ...x, by: member }
        : k === "il.clients" && names.has(x.name) ? { ...x, name: `${x.name} (${member.split("@")[0]})` } : x)); // two "My first client"s would be confusing
      if (k === "il.hist") n += fresh.length;
      data[k] = [...cur, ...fresh];
      if (k === "il.hist") data[k].sort((a, b) => (b.at || b.started || 0) - (a.at || a.started || 0));
    }
    await db.writeJson(`data/${db.fileKey(lead)}.json`, data);
  });
  return n;
}

const origin = req => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
const view = (t, me, c) => t && ({
  name: t.name, lead: t.lead, you: c.teamRole, me: me.name,
  members: [{ name: t.lead, role: "lead" }, ...(t.members || []).map(m => ({ name: m.name, role: m.role, joined: m.joined }))],
});

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const me = await db.requireUser(req, res); if (!me) return;
  try {
    const c = await ctx(me);
    if (req.method === "GET") return res.status(200).json({ team: view(await readTeam(c.space), me, c) });
    if (req.method !== "POST") return res.status(405).json({ error: "Not allowed." });
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
    const lead = c.teamRole === "lead";

    if (b.action === "create") {
      if (c.space !== me.name) return res.status(400).json({ error: "You're already in a team — leave it first." });
      const t = (await readTeam(me.name)) || { lead: me.name, members: [], past: [], created: Date.now() };
      t.name = clean(b.name, 60) || "Our studio";
      await db.writeJson(teamPath(me.name), t); await setLead(me.name, true);
      return res.status(200).json({ team: view(t, me, await ctx(me)) });
    }
    if (b.action === "invite") {
      if (!lead) return res.status(403).json({ error: "Only the team lead can invite people." });
      const code = randomBytes(12).toString("base64url");
      await db.writeJson(`invites/${code}.json`, { lead: me.name, role: ROLES.includes(b.role) ? b.role : "editor", created: Date.now() });
      return res.status(200).json({ link: `${origin(req)}/generation?join=${code}`, code });
    }
    if (b.action === "peek") { // who's inviting me? (before joining)
      const inv = /^[\w-]{10,40}$/.test(String(b.code || "")) ? await db.readJson(`invites/${b.code}.json`).catch(() => null) : null;
      if (!inv || !inv.value || Date.now() - inv.value.created > 7 * 864e5) return res.status(404).json({ error: "This invite has expired or was already used — ask for a new one." });
      const t = await readTeam(inv.value.lead);
      return res.status(200).json({ team: t ? t.name : "a studio", lead: inv.value.lead, role: inv.value.role });
    }
    if (b.action === "join") {
      const code = String(b.code || "");
      const inv = /^[\w-]{10,40}$/.test(code) ? await db.readJson(`invites/${code}.json`).catch(() => null) : null;
      if (!inv || !inv.value || Date.now() - inv.value.created > 7 * 864e5) return res.status(404).json({ error: "This invite has expired or was already used — ask for a new one." });
      const { lead: L, role } = inv.value;
      if (L === me.name) return res.status(400).json({ error: "That's your own invite — send it to someone else." });
      if (c.space !== me.name) return res.status(400).json({ error: "You're already in a team — leave it first." });
      const own = await readTeam(me.name);
      if (own && (own.members || []).length) return res.status(400).json({ error: "You lead a team with members — remove them before joining another." });
      const t = await readTeam(L); if (!t) return res.status(404).json({ error: "That team no longer exists." });
      t.members = (t.members || []).filter(m => m.name !== me.name).concat({ name: me.name, role, joined: Date.now() });
      t.past = (t.past || []).filter(n => n !== me.name);
      await db.writeJson(teamPath(L), t);
      await blob.del(`invites/${code}.json`).catch(() => {});
      if (own) { await blob.del(teamPath(me.name)).catch(() => {}); await setLead(me.name, false); }
      await setUserTeam(me.name, L, role);
      const brought = b.bring ? await bringWork(me.name, L) : 0;
      return res.status(200).json({ ok: true, brought, team: view(t, me, await ctx(me)) });
    }
    if (b.action === "role" || b.action === "remove") {
      if (!lead) return res.status(403).json({ error: "Only the team lead can change members." });
      const t = await readTeam(me.name), who = db.cleanName(b.member);
      const m = t && (t.members || []).find(x => x.name === who); if (!m) return res.status(404).json({ error: "Not in your team." });
      if (b.action === "role") { m.role = ROLES.includes(b.role) ? b.role : "editor"; await setUserTeam(who, me.name, m.role); }
      else { t.members = t.members.filter(x => x.name !== who); t.past = [...new Set([...(t.past || []), who])].slice(-200); await setUserTeam(who, null); }
      await db.writeJson(teamPath(me.name), t);
      return res.status(200).json({ team: view(t, me, c) });
    }
    if (b.action === "leave") {
      if (c.space === me.name) return res.status(400).json({ error: "You're not in someone else's team." });
      const t = await readTeam(c.space);
      if (t) { t.members = (t.members || []).filter(x => x.name !== me.name); t.past = [...new Set([...(t.past || []), me.name])].slice(-200); await db.writeJson(teamPath(c.space), t); }
      await setUserTeam(me.name, null);
      return res.status(200).json({ ok: true });
    }
    if (b.action === "rename") {
      if (!lead) return res.status(403).json({ error: "Only the team lead can rename the studio." });
      const t = await readTeam(me.name); t.name = clean(b.name, 60) || t.name;
      await db.writeJson(teamPath(me.name), t);
      return res.status(200).json({ team: view(t, me, c) });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.log("team failed:", e.message);
    res.status(502).json({ error: e.message });
  }
}

module.exports = { handler, ctx, forget, canReadMedia, withLock, readTeam, nameFromKey, SHARED };
