// Cake Farm key server — Deno Deploy
const KEY_HOURS = 24;
const LV_TOKEN = Deno.env.get("LV_TOKEN") || "";
const kv = await Deno.openKv();

function page(title: string, body: string, isKey = false) {
  const inner = isKey
    ? `<div id="k" style="font-size:22px;letter-spacing:1px;background:#1c1c28;padding:16px 20px;border-radius:12px;display:inline-block">${body}</div>
       <p><button onclick="navigator.clipboard.writeText(document.getElementById('k').innerText);this.innerText='Copied'" style="padding:12px 22px;border:0;border-radius:10px;background:#d4af37;font-weight:700;font-size:15px">Copy key</button></p>
       <p style="color:#999">Valid for ${KEY_HOURS} hours on one device.</p>`
    : `<p>${body}</p>`;
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
     <body style="background:#10101a;color:#eee;font-family:system-ui,sans-serif;text-align:center;padding:48px 20px">
     <h2 style="color:#d4af37">${title}</h2>${inner}</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function text(body: string) {
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function verifyHash(hash: string) {
  const r = await fetch(
    "https://publisher.linkvertise.com/api/v1/anti_bypassing?token=" +
      encodeURIComponent(LV_TOKEN) + "&hash=" + encodeURIComponent(hash),
    { method: "POST" }
  );
  const t = (await r.text()).trim().toUpperCase();
  return t === "TRUE";
}

function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "CAKE-" + s;
}

async function claim(url: URL) {
  const hash = url.searchParams.get("hash");
  if (!hash) return page("Finish the link first", "Open the Linkvertise link and complete every step.");

  const used = await kv.get(["hash", hash]);
  if (used.value) return page("Link already used", "Go back and start from the Linkvertise link again.");

  const ok = await verifyHash(hash);
  if (!ok) return page("Link not completed", "Go back and finish all the Linkvertise steps.");

  await kv.set(["hash", hash], true, { expireIn: 3600 * 1000 });

  const key = randomKey();
  await kv.set(["key", key], { made: Date.now(), id: null }, { expireIn: KEY_HOURS * 3600 * 1000 });
  return page("Your key", key, true);
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

  const scriptRes = await kv.get<string>(["script"]);
  return text(scriptRes.value || "ERR:script not uploaded yet");
}

async function loader() {
  const res = await kv.get<string>(["loader"]);
  return text(res.value || "warn('loader not uploaded')");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/claim") return claim(url);
  if (url.pathname === "/script") return script(url);
  if (url.pathname === "/loader") return loader();
  return text("ok");
});
