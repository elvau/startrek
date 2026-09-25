/* Service Worker: App-Hülle vorab cachen, Daten beim ersten Abruf.
   Bei Änderungen an der App VERSION hochzählen. */
const VERSION = "rk-v1";
const SHELL = ["./", "index.html", "claude-shim.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  // Seite: erst Netz (damit Updates ankommen), sonst Cache
  if (req.mode === "navigate"){
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(cc => cc.put("index.html", c)); return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  // Alles andere (Daten, Icons, Schriften): Cache zuerst, im Hintergrund auffrischen
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") cache.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
