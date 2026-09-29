/* Die frühere Reisekasse hatte hier einen Service Worker, der die alte Seite im Browser zwischenspeicherte.
   Dieser Ersatz räumt den Zwischenspeicher auf, meldet sich ab und lädt offene Seiten neu. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
  })());
});
