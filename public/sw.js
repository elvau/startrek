/* Service Worker für die installierbare App (PWA): hält die App-Dateien vor, damit sie auch ohne Netz startet.
   Seiten und Daten (index.html, *.json) zuerst aus dem Netz, nur ohne Netz aus dem Speicher: so gibt es nie einen alten Stand.
   Gebaute Dateien unter assets/ haben den Inhalt im Namen und kommen direkt aus dem Speicher.
   Fremde Adressen (Such-Dienst, Firebase, Kontodaten) gehen immer am Speicher vorbei.
   Ersetzt zugleich den Aufräum-Worker der früheren Reisekasse: deren Zwischenspeicher wird beim Aktivieren gelöscht. */
const CACHE = "saf-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  const base = new URL(self.registration.scope).pathname;
  if (req.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(base)) return;
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
