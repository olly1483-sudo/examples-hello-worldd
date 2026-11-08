async function loader() {
  const s = await loadChunked("loader");
  return text(s || "warn('loader not uploaded')");
}

// ── Don't Say The Obvious: shared learning ──────────────────────────
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

// ── Make The Logo: shared answer key (pieces keyed by image id) ─────
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

// ── admin ───────────────────────────────────────────────────────────
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
    case "/health": return text(`ok v8 · owner keys: ${OWNER_KEYS.length}`);
    case "/admin":
      if (req.method === "POST") return adminPost(req);
      return adminPage();
    default: return text("ok");
  }
});
