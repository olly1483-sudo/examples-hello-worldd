// Olly Scripts key server — Deno Deploy (multi-game + owner keys + shared learning + usage stats)
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
    case "/script": return script(url);
    case "/loader": return loader();
    case "/dso/push": return req.method === "POST" ? dsoPush(req) : json({ ok: false });
    case "/dso/pull": return dsoPull();
    case "/mtl/push": return req.method === "POST" ? mtlPush(req) : json({ ok: false });
    case "/mtl/pull": return mtlPull();
    case "/stats": return statsPage(url);
    case "/health": return text(`ok v9 · owner keys: ${OWNER_KEYS.length}`);
    case "/admin":
      if (req.method === "POST") return adminPost(req);
      return adminPage();
    default: return text("ok");
  }
});
