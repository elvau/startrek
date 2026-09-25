/*
 * Ersatz für die claude.ai-Laufzeit (window.claude.use), damit die Reisekasse
 * als eigenständige Web-App läuft.
 *
 *  - "db":        Firestore-ähnliche API (doc/collection, get/set/delete, onSnapshot),
 *                 gespeichert im localStorage dieses Geräts, synchron zwischen Tabs.
 *                 Kann später durch ein echtes Backend (Firebase, Supabase …) ersetzt werden.
 *  - "downloads": save({filename, data}) als normaler Browser-Download.
 *  - "mcp":       nicht verfügbar (Flug- und Hotelsuche brauchen ein eigenes Backend).
 */
(function(){
  "use strict";
  if (window.claude && window.claude.use) return; // in claude.ai die echte Laufzeit nutzen

  const PREFIX = "rk-db:";
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const err = (code, message) => Object.assign(new Error(message || code), {code});

  function read(path){
    try { const raw = localStorage.getItem(PREFIX + path); return raw == null ? undefined : JSON.parse(raw); }
    catch(e){ return undefined; }
  }
  function write(path, data){
    try { localStorage.setItem(PREFIX + path, JSON.stringify(data)); }
    catch(e){ throw err("resource_exhausted", "Speicher voll"); }
  }
  function remove(path){ try { localStorage.removeItem(PREFIX + path); } catch(e){} }
  function listIds(coll){
    const ids = [], p = PREFIX + coll + "/";
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(p) && !k.slice(p.length).includes("/")) ids.push(k.slice(p.length));
    }
    return ids.sort();
  }

  const docSnap = (path, data) => ({
    id: path.split("/").pop(),
    exists: data !== undefined,
    data: () => clone(data),
    metadata: {hasPendingWrites: false, fromCache: false}
  });
  const collSnap = coll => {
    const docs = listIds(coll).map(id => docSnap(coll + "/" + id, read(coll + "/" + id))).filter(d => d.exists);
    return {docs, size: docs.length, empty: !docs.length};
  };

  // Beobachter: pro Pfad (Dokument) bzw. pro Sammlung
  const docSubs = new Map(), collSubs = new Map();
  const addSub = (map, key, fn) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(fn); return () => map.get(key).delete(fn); };
  function notify(path){
    const coll = path.split("/").slice(0, -1).join("/");
    (docSubs.get(path) || []).forEach(fn => setTimeout(() => fn(docSnap(path, read(path)))));
    (collSubs.get(coll) || []).forEach(fn => setTimeout(() => fn(collSnap(coll))));
  }
  // Änderungen aus anderen Tabs
  window.addEventListener("storage", e => { if (e.key && e.key.startsWith(PREFIX)) notify(e.key.slice(PREFIX.length)); });

  const db = {
    doc(path){
      path = String(path);
      return {
        id: path.split("/").pop(),
        path,
        async get(){ return docSnap(path, read(path)); },
        async set(data){ write(path, clone(data)); notify(path); },
        async update(data){ write(path, Object.assign(read(path) || {}, clone(data))); notify(path); },
        async delete(){ remove(path); notify(path); },
        onSnapshot(next){ const off = addSub(docSubs, path, next); setTimeout(() => next(docSnap(path, read(path)))); return off; }
      };
    },
    collection(coll){
      coll = String(coll);
      return {
        doc: id => db.doc(coll + "/" + id),
        async get(){ return collSnap(coll); },
        onSnapshot(next){ const off = addSub(collSubs, coll, next); setTimeout(() => next(collSnap(coll))); return off; }
      };
    }
  };

  const downloads = {
    async save({filename, data, mimeType}){
      const blob = data instanceof Blob ? data : new Blob([data], {type: mimeType || (/\.pdf$/i.test(filename) ? "application/pdf" : "application/octet-stream")});
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {href: url, download: filename || "download"});
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  };

  window.claude = {
    standalone: true,
    async use(name){
      if (name === "db") return db;
      if (name === "downloads") return downloads;
      throw err("unavailable", `"${name}" ist in der eigenständigen App nicht verfügbar`);
    }
  };
})();
