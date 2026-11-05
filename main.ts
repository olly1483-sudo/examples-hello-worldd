// Olly Scripts key server — Deno Deploy (multi-game)
const KEY_HOURS = 24;
const LV_TOKEN = (Deno.env.get("LV_TOKEN") || "").trim();
const ADMIN_TOKEN = (Deno.env.get("ADMIN_TOKEN") || "").trim();
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
  return keyPage(key);
}

async function script(url: URL) {
  const key = (url.searchParams.get("key") || "").trim().toUpperCase();
  const id = (url.searchParams.get("id") || "").trim();
  const game = (url.searchParams.get("game") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || !id) return text("ERR:missing key");

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

  const slot = game ? "script_" + game : "script";
  const s = await loadChunked(slot);
  return text(s || `ERR:no script uploaded for ${game || "this game"} yet`);
}

async function loader() {
  const s = await loadChunked("loader");
  return text(s || "warn('loader not uploaded')");
}

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
    case "/health": return text("ok v4");
    case "/admin":
      if (req.method === "POST") return adminPost(req);
      return adminPage();
    default: return text("ok");
  }
});
