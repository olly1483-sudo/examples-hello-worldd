// Cake Farm key server — Deno Deploy
const KEY_HOURS = 24;
const LV_TOKEN = (Deno.env.get("LV_TOKEN") || "").trim();
const kv = await Deno.openKv();

const BG = "#10101a", GOLD = "#d4af37";

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
<p style="color:#999">Valid for ${KEY_HOURS} hours on one device.</p>`);
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

// Returns { ok, status, body } so the caller can show debug on failure.
async function verifyHash(hash: string) {
  const url = "https://publisher.linkvertise.com/api/v1/anti_bypassing?token=" +
    encodeURIComponent(LV_TOKEN) + "&hash=" + encodeURIComponent(hash);
  const r = await fetch(url, { method: "POST" });
  const raw = (await r.text()).trim();

  // Linkvertise may answer with bare "true"/"TRUE" or JSON like {"status":true}.
  let ok = raw.toUpperCase() === "TRUE";
  if (!ok) {
    try {
      const j = JSON.parse(raw);
      ok = j === true || j?.status === true || String(j?.status).toUpperCase() === "TRUE" ||
           String(j?.result).toUpperCase() === "TRUE" || j?.success === true;
    } catch { /* not JSON, leave ok=false */ }
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
    // Visible debug so we can see exactly what Linkvertise returned.
    return msg("DEBUG — not verified",
      `status = ${v.status}<br>body = "${v.body || "(empty)"}"<br>tokenLen = ${LV_TOKEN.length}<br>hash = "${hash}"`);
  }

  await kv.set(["hash", hash], true, { expireIn: 3600 * 1000 });

  const key = randomKey();
  await kv.set(["key", key], { made: Date.now(), id: null }, { expireIn: KEY_HOURS * 3600 * 1000 });
  return keyPage(key);
}

async function script(url: URL) {
  const key = (url.searchParams.get("key") || "").trim().toUpperCase();
  const id = (url.searchParams.get("id") || "").trim();
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

  const s = await kv.get<string>(["script"]);
  return text(s.value || "ERR:script not uploaded yet");
}

async function loader() {
  const s = await kv.get<string>(["loader"]);
  return text(s.value || "warn('loader not uploaded')");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  switch (url.pathname) {
    case "/claim": return claim(url);
    case "/script": return script(url);
    case "/loader": return loader();
    case "/health": return text("ok v2");
    default: return text("ok");
  }
});
