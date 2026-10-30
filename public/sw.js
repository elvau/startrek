/* Service Worker für die installierbare App (PWA): hält die App-Dateien vor, damit sie auch ohne Netz startet.
   Seiten und Daten (index.html, *.json) zuerst aus dem Netz, nur ohne Netz aus dem Speicher: so gibt es nie einen alten Stand.
   Gebaute Dateien unter assets/ haben den Inhalt im Namen und kommen direkt aus dem Speicher.
   Fremde Adressen (Such-Dienst, Firebase, Kontodaten) gehen immer am Speicher vorbei.
   Teilen-Menü (Reise importieren): geteilte Dateien landen kurz im Speicher „saf-share“ (siehe share).
   Ersetzt zugleich den Aufräum-Worker der früheren Reisekasse: deren Zwischenspeicher wird beim Aktivieren gelöscht. */
const CACHE = "saf-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(k => k !== CACHE && k !== "saf-share").map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  const base = new URL(self.registration.scope).pathname;
  // Teilen-Menü (Reise importieren, #457): Dateien und Text kurz ablegen, die App holt sie gleich ab und löscht sie
  if (req.method === "POST" && url.origin === location.origin && url.pathname === base + "share") { e.respondWith(share(req, base)); return; }
  if (req.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(base)) return;
  // Weiterleitung zu Anbietern (go/?l=…): jeder Link anders, nicht im Speicher sammeln
  if (url.pathname.startsWith(base + "go/")) return;
  if (url.pathname.startsWith(base + "assets/")) e.respondWith(cacheFirst(req));
  // die App selbst (nicht Datenschutz, Impressum …) unter einem Schlüssel ohne Suchteil (?aktion=…, Login-Links)
  else e.respondWith(networkFirst(req, url.pathname === base || url.pathname === base + "index.html" ? base : req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req, key) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(key);
    if (hit) return hit;
    throw err;
  }
}

const SHARE = "saf-share";
async function share(req, base) {
  try {
    const form = await req.formData();
    const c = await caches.open(SHARE);
    for (const k of await c.keys()) await c.delete(k);
    const files = form.getAll("files").filter(f => typeof f === "object").slice(0, 6);
    await Promise.all(files.map((f, i) => c.put(`${base}share/${i}`, new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-name": encodeURIComponent(f.name || "Datei") } }))));
    const meta = { n: files.length, text: [form.get("title"), form.get("text")].filter(x => typeof x === "string" && x).join("\n"), url: typeof form.get("url") === "string" ? form.get("url") : "" };
    await c.put(`${base}share/meta`, new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
  } catch { /* dann eben ohne geteilten Inhalt */ }
  return Response.redirect(base + "?share=1", 303);
}
