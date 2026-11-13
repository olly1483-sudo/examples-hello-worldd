// Olly Scripts key server — Deno Deploy (multi-game + owner keys + shared learning + usage stats + key page)
const KEY_HOURS = 24;
const LV_TOKEN = (Deno.env.get("LV_TOKEN") || "").trim();
const ADMIN_TOKEN = (Deno.env.get("ADMIN_TOKEN") || "").trim();
const OWNER_KEYS = (Deno.env.get("OWNER_KEYS") || "")
  .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const kv = await Deno.openKv();

const BG = "#10101a", GOLD = "#d4af37";
const CHUNK_SIZE = 30000;
const SLOT_RE = /^(loader|script(_[a-z0-9]+)?)$/;

function html(title: string, inner: string) {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="background:${BG};color:#eee;font-family:system-ui,sans-serif;text-align:center;padding:48px 20px">
<h2 style="color:${GOLD}">${title}</h2>${inner}</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function keyPage(key: string) {
  return html("Your key",
    `<div id="k" style="font-size:22px;letter-spacing:1px;background:#1c1c28;padding:16px 20px;border-radius:12px;display:inline-block">${key}</div>
<p><button onclick="navigator.clipboard.writeText(document.getElementById('k').innerText);this.innerText='Copied'" style="padding:12px 22px;border:0;border-radius:10px;background:${GOLD};font-weight:700;font-size:15px">Copy key</button></p>
<p style="color:#999">Valid for ${KEY_HOURS} hours on one device. Works in every supported game.</p>`);
}

function msg(title: string, body: string) {
  return html(title, `<p style="max-width:460px;margin:0 auto;line-height:1.5">${body}</p>`);
}

function text(body: string) {
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "CAKE-" + s;
}

async function saveChunked(slot: string, content: string) {
  const parts: string[] = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE) parts.push(content.slice(i, i + CHUNK_SIZE));
  const oldCount = (await kv.get<number>([slot, "count"])).value || 0;
  for (let i = 0; i < Math.max(oldCount, parts.length); i++) {
    if (i < parts.length) await kv.set([slot, "part", i], parts[i]);
    else await kv.delete([slot, "part", i]);
  }
  await kv.set([slot, "count"], parts.length);
}

async function loadChunked(slot: string): Promise<string | null> {
  const count = (await kv.get<number>([slot, "count"])).value;
  if (!count) return null;
  let out = "";
  for (let i = 0; i < count; i++) {
    const p = await kv.get<string>([slot, "part", i]);
    if (p.value == null) return null;
    out += p.value;
  }
  return out;
}

async function verifyHash(hash: string) {
  const url = "https://publisher.linkvertise.com/api/v1/anti_bypassing?token=" +
    encodeURIComponent(LV_TOKEN) + "&hash=" + encodeURIComponent(hash);
  const r = await fetch(url, { method: "POST" });
  const raw = (await r.text()).trim();
  let ok = raw.toUpperCase() === "TRUE";
  if (!ok) {
    try {
      const j = JSON.parse(raw);
      ok = j === true || j?.status === true || String(j?.status).toUpperCase() === "TRUE" ||
           String(j?.result).toUpperCase() === "TRUE" || j?.success === true;
    } catch { /* not JSON */ }
  }
  return { ok, status: r.status, body: raw };
}

// ── usage tracking ─────────────────────────────────────────────────────
function dayStamp(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function trackRun(game: string, id: string, owner: boolean) {
  const slot = game || "medieval";
  const day = dayStamp();
  const seen = await kv.get(["seen", day, slot, id]);
  if (!seen.value) {
    await kv.set(["seen", day, slot, id], { t: Date.now(), owner }, { expireIn: 30 * 86400 * 1000 });
    const c = (await kv.get<number>(["runs", day, slot])).value || 0;
    await kv.set(["runs", day, slot], c + 1, { expireIn: 40 * 86400 * 1000 });
  }
  await kv.set(["last", slot, id], { t: Date.now(), owner }, { expireIn: 7 * 86400 * 1000 });
}

async function claim(url: URL) {
  const hash = url.searchParams.get("hash");
  if (!hash) {
    return msg("Finish the link first", "Open the Linkvertise link and complete every step, then you'll land back here with your key.");
  }
  if ((await kv.get(["hash", hash])).value) {
    return msg("Link already used", "That link was already redeemed. Start again from the Linkvertise link to get a fresh key.");
  }
  const v = await verifyHash(hash);
  if (!v.ok) {
    return msg("Link not verified",
      `Go back and finish every Linkvertise step.<br><br><span style="color:#777;font-size:12px">status ${v.status} · ${v.body || "empty"}</span>`);
  }
  await kv.set(["hash", hash], true, { expireIn: 3600 * 1000 });
  const key = randomKey();
  await kv.set(["key", key], { made: Date.now(), id: null }, { expireIn: KEY_HOURS * 3600 * 1000 });
  const game = (url.searchParams.get("game") || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const day = dayStamp();
  const c = (await kv.get<number>(["claims", day, game || "medieval"])).value || 0;
  await kv.set(["claims", day, game || "medieval"], c + 1, { expireIn: 40 * 86400 * 1000 });
  return keyPage(key);
}

async function script(url: URL) {
  const key = (url.searchParams.get("key") || "").trim().toUpperCase();
  const id = (url.searchParams.get("id") || "").trim();
  const game = (url.searchParams.get("game") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || !id) return text("ERR:missing key");

  const slot = game ? "script_" + game : "script";

  if (OWNER_KEYS.includes(key)) {
    await trackRun(game, id, true);
    const s = await loadChunked(slot);
    return text(s || `ERR:no script uploaded for ${game || "this game"} yet`);
  }

  const res = await kv.get<{ made: number; id: string | null }>(["key", key]);
  if (!res.value) return text("ERR:invalid or expired key");
  const data = res.value;

  if (Date.now() - data.made > KEY_HOURS * 3600 * 1000) {
    await kv.delete(["key", key]);
    return text("ERR:invalid or expired key");
  }
  if (data.id && data.id !== id) return text("ERR:this key is locked to another device");

  if (!data.id) {
    data.id = id;
    const left = Math.max(60000, data.made + KEY_HOURS * 3600 * 1000 - Date.now());
    await kv.set(["key", key], data, { expireIn: left });
  }

  await trackRun(game, id, false);
  const s = await loadChunked(slot);
  return text(s || `ERR:no script uploaded for ${game || "this game"} yet`);
}

async function loader() {
  const s = await loadChunked("loader");
  return text(s || "warn('loader not uploaded')");
}

// ── Don't Say The Obvious: shared learning ────────────────────────────
type Bucket = Record<string, { s: number; n: number }>;
const MAX_PER_PROMPT = 400;
const PROMPT_RE = /^name [a-z0-9 ()'&,\-]{2,70}$/;
const ANSWER_RE = /^[a-z0-9 '&\-.]{1,40}$/;
let pullCache: { at: number; body: string } | null = null;

async function dsoPush(req: Request) {
  let body: { items?: { p?: unknown; a?: unknown; s?: unknown }[] };
  try { body = await req.json(); } catch { return json({ ok: false, err: "bad json" }); }
  const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];

  const groups = new Map<string, { a: string; s: number }[]>();
  for (const it of items) {
    const p = String(it.p ?? "").toLowerCase().trim();
    const a = String(it.a ?? "").toLowerCase().trim();
    const s = Number(it.s);
    if (!PROMPT_RE.test(p) || !ANSWER_RE.test(a) || !isFinite(s) || s < 0 || s > 1) continue;
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push({ a, s });
  }

  for (const [p, list] of groups) {
    const cur = (await kv.get<Bucket>(["dso", p])).value || {};
    for (const { a, s } of list) {
      const e = cur[a];
      if (!e) cur[a] = { s, n: 1 };
      else {
        const n = Math.min(e.n, 50);
        e.s = (e.s * n + s) / (n + 1);
        e.n = e.n + 1;
      }
    }
    const keys = Object.keys(cur);
    if (keys.length > MAX_PER_PROMPT) {
      keys.sort((x, y) => cur[x].s - cur[y].s);
      for (const k of keys.slice(MAX_PER_PROMPT)) delete cur[k];
    }
    await kv.set(["dso", p], cur);
  }
  pullCache = null;
  return json({ ok: true, saved: items.length });
}

async function dsoPull() {
  if (pullCache && Date.now() - pullCache.at < 60000) {
    return new Response(pullCache.body, { headers: { "content-type": "application/json" } });
  }
  const out: Record<string, Record<string, number>> = {};
  for await (const entry of kv.list<Bucket>({ prefix: ["dso"] })) {
    const p = String(entry.key[1]);
    const bucket = entry.value || {};
    out[p] = {};
    for (const [a, e] of Object.entries(bucket)) out[p][a] = Math.round(e.s * 100000) / 100000;
  }
  const body = JSON.stringify(out);
  pullCache = { at: Date.now(), body };
  return new Response(body, { headers: { "content-type": "application/json" } });
}

// ── Make The Logo: shared answer key (pieces keyed by image id) ───────
type MtlPieces = Record<string, { X: number; Y: number; L: number }>;
type MtlEntry = { p: MtlPieces; n: number; a?: { p: MtlPieces; n: number } };
const LOGO_RE = /^[\x20-\x7e]{1,40}$/;
const PIECE_RE = /^a\d{1,20}(_\d{1,2})?$/;
const MTL_KEY = ["mtl2", "all"];
let mtlCache: { at: number; body: string } | null = null;

function cleanPieces(raw: unknown): MtlPieces | null {
  if (!raw || typeof raw !== "object") return null;
  const out: MtlPieces = {};
  let n = 0;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!PIECE_RE.test(id) || !v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const X = Number(o.X), Y = Number(o.Y), L = Number(o.L ?? 0);
    if (!isFinite(X) || !isFinite(Y) || X < 0 || X > 1 || Y < 0 || Y > 1) return null;
    out[id] = { X: Math.round(X * 1e5) / 1e5, Y: Math.round(Y * 1e5) / 1e5, L: isFinite(L) ? Math.round(L) : 0 };
    if (++n > 12) return null;
  }
  return n > 0 ? out : null;
}

function samePieces(a: MtlPieces, b: MtlPieces) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = a[k], y = b[k];
    if (!y || Math.abs(x.X - y.X) > 0.01 || Math.abs(x.Y - y.Y) > 0.01) return false;
  }
  return true;
}

async function mtlPush(req: Request) {
  let body: { logos?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ ok: false, err: "bad json" }); }
  const logos = body.logos && typeof body.logos === "object" ? body.logos : {};
  const all = (await kv.get<Record<string, MtlEntry>>(MTL_KEY)).value || {};
  let saved = 0;
  for (const [name, raw] of Object.entries(logos).slice(0, 40)) {
    if (!LOGO_RE.test(name)) continue;
    const p = cleanPieces(raw);
    if (!p) continue;
    const cur = all[name];
    if (!cur) {
      if (Object.keys(all).length >= 500) continue;
      all[name] = { p, n: 1 };
    } else if (samePieces(cur.p, p)) {
      cur.n = Math.min(cur.n + 1, 1000);
    } else {
      if (cur.a && samePieces(cur.a.p, p)) cur.a.n = Math.min(cur.a.n + 1, 1000);
      else cur.a = { p, n: 1 };
      if (cur.a.n > cur.n) { const old = { p: cur.p, n: cur.n }; cur.p = cur.a.p; cur.n = cur.a.n; cur.a = old; }
    }
    saved++;
  }
  if (saved > 0) { await kv.set(MTL_KEY, all); mtlCache = null; }
  return json({ ok: true, saved });
}

async function mtlPull() {
  if (mtlCache && Date.now() - mtlCache.at < 60000) {
    return new Response(mtlCache.body, { headers: { "content-type": "application/json" } });
  }
  const all = (await kv.get<Record<string, MtlEntry>>(MTL_KEY)).value || {};
  const out: Record<string, MtlPieces> = {};
  for (const [name, e] of Object.entries(all)) out[name] = e.p;
  const body = JSON.stringify(out);
  mtlCache = { at: Date.now(), body };
  return new Response(body, { headers: { "content-type": "application/json" } });
}

// ── usage dashboard ───────────────────────────────────────────────────
const GAME_NAMES: Record<string, string> = {
  medieval: "Medieval Life",
  wordrush: "Word Rush",
  wordbattle: "Word Battle",
  dso: "Don't Say The Obvious",
  hid: "Hide In Drawings",
  mtl: "Make The Logo",
  ctw: "Connect the Words",
  coins: "Collect 1 Million Coins",
};
function gameName(slot: string) { return GAME_NAMES[slot] || slot; }

async function statsPage(url: URL) {
  if (!ADMIN_TOKEN || url.searchParams.get("pass") !== ADMIN_TOKEN) {
    return html("Usage", `<p style="color:#999">Add <code>?pass=YOURPASSWORD</code> to the address.</p>`);
  }
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(dayStamp(new Date(Date.now() - i * 86400000)));

  const runs: Record<string, Record<string, number>> = {};
  const claims: Record<string, Record<string, number>> = {};
  const slots = new Set<string>();
  for (const day of days) {
    runs[day] = {}; claims[day] = {};
    for await (const e of kv.list<number>({ prefix: ["runs", day] })) {
      const s = String(e.key[2]); slots.add(s); runs[day][s] = e.value || 0;
    }
    for await (const e of kv.list<number>({ prefix: ["claims", day] })) {
      const s = String(e.key[2]); slots.add(s); claims[day][s] = e.value || 0;
    }
  }

  const now = Date.now();
  let activeHour = 0, activeDay = 0;
  const rowsRecent: { slot: string; id: string; mins: number }[] = [];
  for await (const e of kv.list<{ t: number; owner?: boolean }>({ prefix: ["last"] })) {
    const v = e.value;
    if (!v || v.owner) continue;
    const mins = Math.round((now - v.t) / 60000);
    if (mins < 60) activeHour++;
    if (mins < 1440) activeDay++;
    rowsRecent.push({ slot: String(e.key[1]), id: String(e.key[2]), mins });
  }
  rowsRecent.sort((a, b) => a.mins - b.mins);

  const slotList = [...slots].sort();
  const head = slotList.map((s) => `<th>${gameName(s)}</th>`).join("");
  const body7 = days.map((d) => {
    const cells = slotList.map((s) => {
      const r = runs[d][s] || 0, c = claims[d][s] || 0;
      return `<td>${r}${c ? ` <span style="color:#777">(${c} keys)</span>` : ""}</td>`;
    }).join("");
    return `<tr><td>${d}</td>${cells}</tr>`;
  }).join("");

  const recentRows = rowsRecent.slice(0, 60).map((r) =>
    `<tr><td>${gameName(r.slot)}</td><td>${r.id}</td><td>${r.mins < 1 ? "just now" : r.mins < 60 ? r.mins + "m ago" : Math.round(r.mins / 60) + "h ago"}</td></tr>`
  ).join("") || `<tr><td colspan="3" style="color:#777">nobody yet</td></tr>`;

  const tableCss = `border-collapse:collapse;font-size:13px;width:100%`;
  const cell = `border:1px solid #2a2a3a;padding:7px 9px;text-align:left`;
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<body style="background:${BG};color:#eee;font-family:system-ui,sans-serif;padding:20px 14px;max-width:900px;margin:0 auto">
<style>td,th{${cell}}th{color:${GOLD}}</style>
<h2 style="color:${GOLD};margin-bottom:4px">Script usage</h2>
<p style="color:#999;font-size:12px;margin-top:0">refreshes every minute · your own runs are excluded</p>
<p style="font-size:16px">Active last hour: <b style="color:${GOLD}">${activeHour}</b> &nbsp;·&nbsp; last 24h: <b style="color:${GOLD}">${activeDay}</b></p>
<h3 style="color:${GOLD};font-size:15px">Unique users per day</h3>
<div style="overflow-x:auto"><table style="${tableCss}"><tr><th>Day</th>${head || "<th>—</th>"}</tr>${body7}</table></div>
<h3 style="color:${GOLD};font-size:15px">Who ran what, most recent first</h3>
<div style="overflow-x:auto"><table style="${tableCss}"><tr><th>Game</th><th>Roblox user ID</th><th>When</th></tr>${recentRows}</table></div>
</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// ── key page (a normal page with a button, not a redirect — for ScriptBlox) ──
const KEY_LINKS: Record<string, string> = {
  wordrush: "https://direct-link.net/10547788/gyBw3vHFJ871",
  wordbattle: "https://link-center.net/10547788/xbvK1oKIHsyh",
  dso: "https://link-target.net/10547788/tfp3YwhBKKoT",
  hid: "https://direct-link.net/10547788/B186RRxQ8D6I",
  mtl: "https://link-target.net/10547788/k2fwkPsrwmtQ",
  ctw: "https://link-target.net/10547788/G8UQJC5Sy5ZV",
  coins: "https://link-center.net/10547788/qHrlm8WScylM",
};

function getKeyPage(url: URL) {
  const game = (url.searchParams.get("game") || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const link = KEY_LINKS[game];
  if (!link) return html("Get your key", `<p style="color:#999">Unknown game.</p>`);
  return html("Get your key — " + gameName(game),
    `<p style="max-width:460px;margin:0 auto 18px;line-height:1.5;color:#bbb">Tap the button, finish the steps, and your key appears at the end.</p>
<p><a href="${link}" style="display:inline-block;padding:14px 26px;border-radius:12px;background:${GOLD};color:#10101a;font-weight:700;font-size:16px;text-decoration:none">Get key</a></p>
<p style="color:#999">Then paste it into the script menu and tap Run.</p>`);
}

// ── admin ─────────────────────────────────────────────────────────────
function adminPage(msgText = "") {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="background:${BG};color:#eee;font-family:system-ui,sans-serif;padding:24px 16px;max-width:600px;margin:0 auto">
<h2 style="color:${GOLD}">Upload</h2>
${msgText ? `<p style="color:${GOLD}">${msgText}</p>` : ""}
<form method="POST" action="/admin">
<label>Password<br><input type="password" name="pass" style="width:100%;padding:10px;margin:6px 0 16px;border-radius:8px;border:0" required></label><br>
<label>Which slot<br>
<select name="slot" style="width:100%;padding:10px;margin:6px 0 8px;border-radius:8px">
<option value="script">script — Medieval Life (cake farm)</option>
<option value="script_wordrush">script_wordrush — Word Rush</option>
<option value="script_wordbattle">script_wordbattle — Word Battle</option>
<option value="script_dso">script_dso — Don't Say The Obvious</option>
<option value="script_hid">script_hid — Hide In Drawings</option>
<option value="script_mtl">script_mtl — Make The Logo</option>
<option value="script_ctw">script_ctw — Connect the Words</option>
<option value="script_coins">script_coins — Collect 1 Million Coins</option>
<option value="loader">loader — the loader everyone runs</option>
</select></label><br>
<label style="color:#999;font-size:13px">Or type a new slot (for future games, e.g. script_mygame)<br>
<input name="custom" style="width:100%;padding:10px;margin:6px 0 16px;border-radius:8px;border:0" placeholder="leave empty to use the dropdown"></label><br>
<label>Paste the full code below<br>
<textarea name="content" rows="14" style="width:100%;padding:10px;margin:6px 0 16px;border-radius:8px;font-family:monospace;font-size:13px" required></textarea></label><br>
<button type="submit" style="padding:14px 24px;border:0;border-radius:10px;background:${GOLD};font-weight:700;font-size:16px;width:100%">Save</button>
</form>
<p style="margin-top:22px"><a href="/stats" style="color:${GOLD}">View usage stats →</a></p>
</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function adminPost(req: Request) {
  try {
    const form = await req.formData();
    const pass = String(form.get("pass") || "");
    const custom = String(form.get("custom") || "").trim().toLowerCase();
    const slot = custom || String(form.get("slot") || "");
    const content = String(form.get("content") || "");

    if (!ADMIN_TOKEN || pass !== ADMIN_TOKEN) return adminPage("Wrong password.");
    if (!SLOT_RE.test(slot)) return adminPage(`Invalid slot "${slot}". Use loader, script, or script_name.`);
    if (!content.trim()) return adminPage("Nothing pasted.");

    await saveChunked(slot, content);
    return adminPage(`Saved ${slot} — ${content.length} characters.`);
  } catch (e) {
    return adminPage(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  switch (url.pathname) {
    case "/claim": return claim(url);
    case "/getkey": return getKeyPage(url);
    case "/script": return script(url);
    case "/loader": return loader();
    case "/dso/push": return req.method === "POST" ? dsoPush(req) : json({ ok: false });
    case "/dso/pull": return dsoPull();
    case "/mtl/push": return req.method === "POST" ? mtlPush(req) : json({ ok: false });
    case "/mtl/pull": return mtlPull();
    case "/stats": return statsPage(url);
    case "/health": return text(`ok v11 · owner keys: ${OWNER_KEYS.length}`);
    case "/admin":
      if (req.method === "POST") return adminPost(req);
      return adminPage();
    default: return text("ok");
  }
});
-- Olly Scripts Loader (multi-game)
local API = "https://examples-hello-worldd.olly1483.deno.net"
local DISCORD = "https://discord.gg/KDDKAakG3y"
local KEY_FILE = "cakefarm_key.txt"

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UIS = game:GetService("UserInputService")
local plr = Players.LocalPlayer
local id = tostring(plr.UserId)

-- ── which game are we in? ───────────────────────────────────────────────
local GAMES = {
    { slot = "wordrush", name = "Word Rush",
      link = "https://direct-link.net/10547788/gyBw3vHFJ871",
      detect = function() return RS:FindFirstChild("GTC_Remotes") ~= nil end },
    { slot = "wordbattle", name = "Word Battle",
      link = "https://link-center.net/10547788/xbvK1oKIHsyh",
      detect = function()
          return workspace:FindFirstChild("MatchmakingFolders") ~= nil
             and RS:FindFirstChild("Framework") ~= nil
      end },
    { slot = "dso", name = "Don't Say The Obvious",
      link = "https://link-target.net/10547788/tfp3YwhBKKoT",
      detect = function()
          local rem = RS:FindFirstChild("Remotes")
          return rem ~= nil and rem:FindFirstChild("TableReveal") ~= nil
             and rem:FindFirstChild("SubmitAnswer") ~= nil
      end },
    { slot = "hid", name = "Hide In Drawings",
      link = "https://direct-link.net/10547788/B186RRxQ8D6I",
      detect = function()
          local net = RS:FindFirstChild("shared/network@GlobalEvents")
          return net ~= nil and net:FindFirstChild("moveCutout") ~= nil
      end },
    { slot = "mtl", name = "Make The Logo",
      link = "https://link-target.net/10547788/k2fwkPsrwmtQ",
      detect = function()
          local pgui = plr:FindFirstChild("PlayerGui")
          local gp = pgui and pgui:FindFirstChild("Gameplay")
          if not gp then return false end
          return gp:FindFirstChild("minigame") ~= nil
              or gp:FindFirstChild("canvas", true) ~= nil
              or gp:FindFirstChild("Pieces", true) ~= nil
      end },
    { slot = "ctw", name = "Connect the Words",
      link = "https://link-target.net/10547788/G8UQJC5Sy5ZV",
      detect = function()
          local pgui = plr:FindFirstChild("PlayerGui")
          if pgui and pgui:FindFirstChild("NewRoundUI") then return true end
          for _, c in ipairs(RS:GetChildren()) do
              if c.Name:find("bridgenet", 1, true) then
                  local re = RS:FindFirstChild("RemoteEvents")
                  return re ~= nil and re:FindFirstChild("ReplicaSet") ~= nil
              end
          end
          return false
      end },
    { slot = "coins", name = "Collect 1 Million Coins",
      link = "https://link-center.net/10547788/qHrlm8WScylM",
      detect = function()
          if game.PlaceId == 104925314500500 then return true end
          local rem = RS:FindFirstChild("Remotes")
          return rem ~= nil and rem:FindFirstChild("CoinPickup") ~= nil
             and rem:FindFirstChild("CoinPileSnapshot") ~= nil
      end },
}
local current = nil
for _, g in ipairs(GAMES) do
    local ok, yes = pcall(g.detect)
    if ok and yes then current = g break end
end

local function notify(txt)
    pcall(function()
        game:GetService("StarterGui"):SetCore("SendNotification", {
            Title = "Olly Scripts", Text = txt, Duration = 5,
        })
    end)
end

local function copy(s)
    return pcall(function()
        if setclipboard then setclipboard(s)
        elseif toclipboard then toclipboard(s)
        else error("no clipboard") end
    end)
end

local function guiParent()
    local ok, p = pcall(function() return gethui and gethui() end)
    if ok and p then return p end
    local ok2 = pcall(function() return game:GetService("CoreGui").Name end)
    if ok2 then return game:GetService("CoreGui") end
    return plr:WaitForChild("PlayerGui")
end

-- ── glass helpers ──────────────────────────────────────────────────────
local function corner(o, r) local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, r) c.Parent = o end
local function stroke(o, tr)
    local s = Instance.new("UIStroke") s.Color = Color3.fromRGB(255,255,255)
    s.Thickness = 1.2 s.Transparency = tr s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border s.Parent = o
end
local function glass(o, t)
    o.BackgroundColor3 = Color3.fromRGB(244, 247, 255) o.BackgroundTransparency = t
    local g = Instance.new("UIGradient") g.Rotation = 90
    g.Color = ColorSequence.new(Color3.fromRGB(255,255,255), Color3.fromRGB(206,216,246))
    g.Parent = o
    stroke(o, 0.35)
end
local BLURPLE = Color3.fromRGB(88, 101, 242)

-- ── floating Discord pill (shown in every game) ───────────────────────
local function discordPill()
    local par = guiParent()
    local old = par:FindFirstChild("OllyDiscord") if old then old:Destroy() end
    local sg = Instance.new("ScreenGui")
    sg.Name = "OllyDiscord" sg.ResetOnSpawn = false sg.IgnoreGuiInset = true
    sg.DisplayOrder = 9998 sg.Parent = par

    local pill = Instance.new("TextButton")
    pill.AnchorPoint = Vector2.new(0, 0.5)
    pill.Position = UDim2.new(0, 16, 0.72, 0)
    pill.Size = UDim2.new(0, 104, 0, 34)
    pill.AutoButtonColor = false pill.Text = ""
    pill.Parent = sg
    glass(pill, 0.3) corner(pill, 17)
    local sc = Instance.new("UIScale") sc.Parent = pill

    local dot = Instance.new("Frame")
    dot.AnchorPoint = Vector2.new(0, 0.5)
    dot.Position = UDim2.new(0, 10, 0.5, 0) dot.Size = UDim2.new(0, 18, 0, 18)
    dot.BackgroundColor3 = BLURPLE dot.BorderSizePixel = 0 dot.Parent = pill
    corner(dot, 9)
    local ic = Instance.new("TextLabel")
    ic.BackgroundTransparency = 1 ic.Size = UDim2.new(1, 0, 1, 0)
    ic.Font = Enum.Font.GothamBold ic.TextSize = 11
    ic.TextColor3 = Color3.fromRGB(255,255,255) ic.Text = "D" ic.Parent = dot

    local lbl = Instance.new("TextLabel")
    lbl.BackgroundTransparency = 1
    lbl.Position = UDim2.new(0, 34, 0, 0) lbl.Size = UDim2.new(1, -40, 1, 0)
    lbl.Font = Enum.Font.GothamBold lbl.TextSize = 12
    lbl.TextColor3 = Color3.fromRGB(26, 30, 44)
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.Text = "Discord" lbl.Parent = pill

    local di, start, spos, moved
    pill.InputBegan:Connect(function(i)
        if i.UserInputType == Enum.UserInputType.Touch or i.UserInputType == Enum.UserInputType.MouseButton1 then
            di, start, spos, moved = i, i.Position, pill.Position, 0
            TweenService:Create(sc, TweenInfo.new(0.1), {Scale = 0.92}):Play()
        end
    end)
    UIS.InputChanged:Connect(function(i)
        if not di then return end
        if i.UserInputType == Enum.UserInputType.Touch or i.UserInputType == Enum.UserInputType.MouseMovement then
            local d = i.Position - start
            if d.Magnitude > moved then moved = d.Magnitude end
            pill.Position = UDim2.new(spos.X.Scale, spos.X.Offset + d.X, spos.Y.Scale, spos.Y.Offset + d.Y)
        end
    end)
    UIS.InputEnded:Connect(function(i)
        if di and (i.UserInputType == Enum.UserInputType.Touch or i.UserInputType == Enum.UserInputType.MouseButton1) then
            di = nil
            TweenService:Create(sc, TweenInfo.new(0.16, Enum.EasingStyle.Back), {Scale = 1}):Play()
            if moved < 8 then
                if copy(DISCORD) then
                    lbl.Text = "Copied!"
                    notify("Discord invite copied — paste it in Safari")
                    task.delay(1.6, function() lbl.Text = "Discord" end)
                else
                    notify(DISCORD)
                end
            end
        end
    end)
end

-- ── key check ──────────────────────────────────────────────────────────
local function tryKey(key)
    local url = API .. "/script?key=" .. key .. "&id=" .. id
    if current.slot ~= "" then url = url .. "&game=" .. current.slot end
    local ok, body = pcall(function() return game:HttpGet(url) end)
    if not ok then return nil, "couldn't reach the server" end
    if body:sub(1, 4) == "ERR:" then return nil, body:sub(5) end
    return body, nil
end

local function saveKey(key)
    pcall(function() if writefile then writefile(KEY_FILE, key) end end)
end
local function loadSavedKey()
    local ok, data = pcall(function()
        if isfile and isfile(KEY_FILE) and readfile then return readfile(KEY_FILE) end
    end)
    if ok and data and data ~= "" then return (data:gsub("%s+", "")) end
end

local function run(body)
    notify(current.name .. " — loading")
    local fn, err = loadstring(body)
    if fn then task.spawn(fn) else notify("Script error: " .. tostring(err)) end
    discordPill()
end

-- a game we don't have a script for: say so, keep the Discord button, stop here
if not current then
    notify("This game isn't supported yet. Join the Discord to request it.")
    discordPill()
    return
end
local KEY_LINK = current.link

-- saved key → straight in
local saved = loadSavedKey()
if saved then
    local body, err = tryKey(saved)
    if body then run(body) return end
    if err and (err:find("invalid") or err:find("locked")) then
        pcall(function() if delfile then delfile(KEY_FILE) end end)
    elseif err then
        notify(err)
        if err:find("no script") then return end
    end
end

-- ── key box ────────────────────────────────────────────────────────────
local gui = Instance.new("ScreenGui")
gui.Name = "OllyKeyGui" gui.ResetOnSpawn = false gui.IgnoreGuiInset = true
gui.Parent = guiParent()

local frame = Instance.new("Frame")
frame.AnchorPoint = Vector2.new(0.5, 0.5)
frame.Position = UDim2.new(0.5, 0, 0.5, 0)
frame.Size = UDim2.new(0, 300, 0, 232)
frame.BorderSizePixel = 0 frame.Parent = gui
glass(frame, 0.35) corner(frame, 24)

local title = Instance.new("TextLabel")
title.BackgroundTransparency = 1
title.Position = UDim2.new(0, 20, 0, 14) title.Size = UDim2.new(1, -40, 0, 22)
title.Font = Enum.Font.GothamBold title.TextSize = 16
title.TextColor3 = Color3.fromRGB(26, 30, 44)
title.TextXAlignment = Enum.TextXAlignment.Left
title.Text = "Olly Scripts" title.Parent = frame

local sub = Instance.new("TextLabel")
sub.BackgroundTransparency = 1
sub.Position = UDim2.new(0, 20, 0, 36) sub.Size = UDim2.new(1, -40, 0, 16)
sub.Font = Enum.Font.GothamMedium sub.TextSize = 11
sub.TextColor3 = Color3.fromRGB(78, 86, 110)
sub.TextXAlignment = Enum.TextXAlignment.Left
sub.Text = "Detected: " .. current.name sub.Parent = frame

local box = Instance.new("TextBox")
box.Position = UDim2.new(0, 18, 0, 64) box.Size = UDim2.new(1, -36, 0, 40)
box.PlaceholderText = "CAKE-XXXXXXXXXXXXXXXX" box.Text = ""
box.ClearTextOnFocus = false
box.Font = Enum.Font.GothamMedium box.TextSize = 14
box.TextColor3 = Color3.fromRGB(26, 30, 44)
box.PlaceholderColor3 = Color3.fromRGB(130, 138, 160)
box.Parent = frame
glass(box, 0.4) corner(box, 12)

local function btn(x, y, w, txt, kind)
    local b = Instance.new("TextButton")
    b.Position = UDim2.new(x, x == 0 and 18 or 4, 0, y)
    b.Size = UDim2.new(w, w == 1 and -36 or -22, 0, 38)
    b.AutoButtonColor = false b.Text = txt
    b.Font = Enum.Font.GothamBold b.TextSize = 14 b.Parent = frame
    corner(b, 13)
    if kind == "blue" or kind == "discord" then
        local c1 = kind == "discord" and Color3.fromRGB(128, 140, 255) or Color3.fromRGB(150,178,255)
        local c2 = kind == "discord" and BLURPLE or Color3.fromRGB(96,128,240)
        b.BackgroundColor3 = c2 b.BackgroundTransparency = 0.08
        b.TextColor3 = Color3.fromRGB(255, 255, 255)
        local g = Instance.new("UIGradient") g.Rotation = 90
        g.Color = ColorSequence.new(c1, c2) g.Parent = b
        stroke(b, 0.5)
    else
        glass(b, 0.45) b.TextColor3 = Color3.fromRGB(26, 30, 44)
    end
    return b
end
local getBtn  = btn(0,   114, 0.5, "Get Key", "glass")
local discBtn = btn(0.5, 114, 0.5, "Discord", "discord")
local runBtn  = btn(0,   160, 1,   "Run",     "blue")

local toast = Instance.new("TextLabel")
toast.BackgroundTransparency = 1
toast.Position = UDim2.new(0, 10, 1, -26) toast.Size = UDim2.new(1, -20, 0, 18)
toast.Font = Enum.Font.GothamMedium toast.TextSize = 11
toast.TextColor3 = Color3.fromRGB(70, 160, 110)
toast.TextTransparency = 1 toast.Text = "" toast.Parent = frame

local toastThread
local function showToast(txt, bad)
    toast.Text = txt
    toast.TextColor3 = bad and Color3.fromRGB(205, 85, 90) or Color3.fromRGB(70, 160, 110)
    toast.TextTransparency = 0
    if toastThread then task.cancel(toastThread) end
    toastThread = task.spawn(function()
        task.wait(2.5)
        TweenService:Create(toast, TweenInfo.new(1), { TextTransparency = 1 }):Play()
    end)
end

getBtn.MouseButton1Click:Connect(function()
    if copy(KEY_LINK) then showToast("Key link copied — paste it in Safari")
    else showToast("Copy failed", true) warn("[Olly Scripts] Key link: " .. KEY_LINK) end
end)

discBtn.MouseButton1Click:Connect(function()
    if copy(DISCORD) then showToast("Discord invite copied — paste it in Safari")
    else showToast("Copy failed", true) warn("[Olly Scripts] Discord: " .. DISCORD) end
end)

runBtn.MouseButton1Click:Connect(function()
    local key = box.Text:gsub("%s+", ""):upper()
    if key == "" then showToast("Paste your key first", true) return end
    runBtn.Text = "Checking…"
    local body, err = tryKey(key)
    runBtn.Text = "Run"
    if body then
        saveKey(key)
        gui:Destroy()
        run(body)
    else
        showToast(err or "Invalid key", true)
    end
end)
