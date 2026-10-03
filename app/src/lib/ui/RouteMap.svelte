<script lang="ts">
  /*
   * Reisekarte: Route mit Stationen auf der Karte (OpenFreeMap), als Bild zum Teilen und als Animation (Strecke für
   * Strecke, Kamera folgt, Tage als Untertitel), die sich auch als Video speichern lässt. Alles im Browser.
   */
  import { onDestroy, onMount } from "svelte";
  import { t, tn } from "../i18n/index.svelte";
  import type { Map as MlMap, Marker } from "maplibre-gl";
  import { arc, focus, type Route, type RSeg } from "../route";
  import type { Day } from "../itinerary";
  import { kmBetween } from "../geo/places";

  let { route, days, title, sub }: { route: Route; days: Day[]; title: string; sub: string } = $props();

  const STYLE = "https://tiles.openfreemap.org/styles/liberty";
  const COL = { flight: "#2F6FE4", ground: "#1F9E7A", station: "#C2457A" };
  let box: HTMLDivElement;
  let map: MlMap | undefined;
  let lib: typeof import("maplibre-gl") | undefined;
  let markers: Marker[] = [];
  let failed = $state(false);
  let ready = $state(false);
  let playing = $state(false);
  let recording = $state(false);
  let caption = $state("");
  let busy = $state("");
  let stop = false;

  const coords = (s: RSeg): [number, number][] => {
    const a = route.points[s.a], b = route.points[s.b];
    if (s.mode === "flight") return arc(a, b, 64);
    return Array.from({ length: 31 }, (_, i) => [a.lon + ((b.lon - a.lon) * i) / 30, a.lat + ((b.lat - a.lat) * i) / 30] as [number, number]);
  };
  const fc = (segs: { mode: string; c: [number, number][] }[]) => ({
    type: "FeatureCollection" as const,
    features: segs.map(s => ({ type: "Feature" as const, properties: { mode: s.mode }, geometry: { type: "LineString" as const, coordinates: s.c } }))
  });
  const all = () => fc(route.segs.map(s => ({ mode: s.mode, c: coords(s) })));

  async function init() {
    try {
      const [m] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
      lib = m;
      if (!box) return;
      map = new m.Map({ container: box, style: STYLE, center: [10, 45], zoom: 3, attributionControl: { compact: true }, cooperativeGestures: true,
        canvasContextAttributes: { preserveDrawingBuffer: true } });
      map.addControl(new m.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        const mp = map!;
        mp.addSource("route", { type: "geojson", data: all() });
        mp.addSource("done", { type: "geojson", data: fc([]) });
        mp.addLayer({ id: "route-ground", type: "line", source: "route", filter: ["==", ["get", "mode"], "ground"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COL.ground, "line-width": 4, "line-opacity": 0.85 } });
        mp.addLayer({ id: "route-flight", type: "line", source: "route", filter: ["==", ["get", "mode"], "flight"], layout: { "line-cap": "round" }, paint: { "line-color": COL.flight, "line-width": 3, "line-dasharray": [2, 2] } });
        mp.addLayer({ id: "done", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#F2A541", "line-width": 6 } });
        drawMarkers();
        fit(0);
        ready = true;
      });
    } catch { failed = true; }
  }
  onMount(() => { void init(); });
  onDestroy(() => { stop = true; map?.remove(); });

  function drawMarkers() {
    for (const x of markers) x.remove();
    markers = [];
    const seenHome = new Set<string>();
    route.points.forEach((p, i) => {
      if (p.kind === "airport") return;
      if (p.kind === "home") { if (seenHome.has(p.name)) return; seenHome.add(p.name); }
      const el = document.createElement("div");
      el.className = `rm-pin rm-${p.kind}`;
      const n = route.points.slice(0, i + 1).filter(x => x.kind === "station").length;
      el.textContent = p.kind === "home" ? `🏠 ${p.name}` : `${n} · ${p.name}${p.nights ? ` · ${tn("n.nights", p.nights)}` : ""}`;
      markers.push(new lib!.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map!));
    });
  }
  function fit(duration = 900, pts = focus(route).map(p => [p.lon, p.lat] as [number, number])) {
    if (!map || !lib || !pts.length) return;
    const b = new lib.LngLatBounds();
    for (const p of pts) b.extend(p);
    // oben mehr Platz: dort stehen die Schilder der Stationen
    map.fitBounds(b, { padding: { top: 90, bottom: 60, left: 70, right: 70 }, maxZoom: 11, duration });
  }
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  /** für Bild und Video: Karte vorübergehend im Seitenverhältnis des Bildausschnitts (sonst schneidet das Hochformat ab) */
  async function shape(w: number, h: number): Promise<() => void> {
    const old = box.getAttribute("style") || "";
    const head = Math.round(h * 0.16), foot = Math.round(h * 0.07), mh = h - head - foot;
    const cw = Math.min(box.clientWidth, 600);
    box.setAttribute("style", `${old};width:${cw}px;height:${Math.round((cw * mh) / w)}px;max-width:100%`);
    map!.resize(); fit(0); await idle(); await wait(250);
    return () => { box.setAttribute("style", old); map?.resize(); fit(0); };
  }
  const idle = () => new Promise<void>(r => (map!.loaded() && !map!.isMoving() ? r() : map!.once("idle", () => r())));

  /* ---------- Bild ---------- */

  /** Karte mit Titel, Stationen und Absender auf eine Leinwand (für Bild und Video) */
  function compose(cv: HTMLCanvasElement, w: number, h: number, cap = "") {
    const g = cv.getContext("2d")!;
    const src = map!.getCanvas();
    const head = Math.round(h * 0.16), foot = Math.round(h * 0.07), mh = h - head - foot;
    g.fillStyle = "#0E2438"; g.fillRect(0, 0, w, h);
    // Karte so hineinlegen, dass sie den Bereich füllt (Mitte bleibt Mitte)
    const s = Math.max(w / src.width, mh / src.height), dw = src.width * s, dh = src.height * s;
    g.save(); g.beginPath(); g.rect(0, head, w, mh); g.clip();
    g.drawImage(src, (w - dw) / 2, head + (mh - dh) / 2, dw, dh);
    // Stationen (die Marker der Karte sind HTML und fehlen im Bild): Punkt und Name
    const dpr = src.width / map!.getContainer().clientWidth;
    let n = 0;
    const fs = Math.round(h * 0.026);
    g.font = `700 ${fs}px Figtree Variable, system-ui, sans-serif`;
    // Schilder, die sich überdecken würden, weichen nach unten aus
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const hit = (r: { x: number; y: number; w: number; h: number }) => placed.some(q => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
    for (const p of route.points) {
      if (p.kind !== "station") continue;
      n++;
      const q = map!.project([p.lon, p.lat]);
      const x = (w - dw) / 2 + q.x * dpr * s, y = head + (mh - dh) / 2 + q.y * dpr * s;
      const label = `${n} · ${p.name}${p.nights ? ` · ${tn("n.nights", p.nights)}` : ""}`;
      const tw = g.measureText(label).width, bw = tw + fs, bh = fs * 1.6;
      let r = { x: Math.min(w - bw - 8, Math.max(8, x - bw / 2)), y: y - fs * 2.3, w: bw, h: bh };
      for (const dy of [0, fs * 3.1, -fs * 1.9, fs * 5]) { const c = { ...r, y: y - fs * 2.3 + dy }; if (!hit(c)) { r = c; break; } }
      placed.push(r);
      g.fillStyle = COL.station; g.beginPath(); g.arc(x, y, fs * 0.45, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#fff"; g.lineWidth = fs * 0.15; g.stroke();
      g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, fs * 0.8); g.fill();
      g.fillStyle = "#15202E"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    }
    g.restore();
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillStyle = "#fff"; g.font = `800 ${Math.round(head * 0.36)}px Bricolage Grotesque Variable, system-ui, sans-serif`;
    g.fillText(title, w * 0.04, head * 0.55, w * 0.92);
    g.fillStyle = "rgba(255,255,255,.8)"; g.font = `600 ${Math.round(head * 0.2)}px Figtree Variable, system-ui, sans-serif`;
    g.fillText(cap || sub, w * 0.04, head * 0.86, w * 0.92);
    g.fillStyle = "rgba(255,255,255,.75)"; g.font = `700 ${Math.round(foot * 0.42)}px Figtree Variable, system-ui, sans-serif`;
    g.fillText("Split&Fly · splitandfly.com", w * 0.04, h - foot * 0.35);
    g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,.55)"; g.font = `500 ${Math.round(foot * 0.3)}px Figtree Variable, system-ui, sans-serif`;
    g.fillText("© OpenStreetMap · OpenFreeMap", w * 0.96, h - foot * 0.35);
  }

  async function save(blob: Blob, name: string) {
    const file = new File([blob], name, { type: blob.type });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; } } catch { /* abgebrochen: herunterladen */ }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function shareImage() {
    if (!map) return;
    busy = t("route.making");
    try {
      const cv = document.createElement("canvas"); cv.width = 1200; cv.height = 1500;
      const back = await shape(cv.width, cv.height);
      compose(cv, cv.width, cv.height);
      back();
      const blob = await new Promise<Blob | null>(r => cv.toBlob(r, "image/png"));
      if (blob) await save(blob, `${slug(title)}-route.png`);
    } catch { busy = t("route.imgFailed"); await wait(2500); }
    busy = "";
  }
  const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reise";

  /* ---------- Animation ---------- */

  /** Untertitel zu einer Strecke: Flug, Weiterreise oder Tag an der Station */
  function captionFor(s: RSeg): string {
    const a = route.points[s.a], b = route.points[s.b];
    if (s.mode === "flight") return `✈ ${a.name} → ${b.name}`;
    if (b.kind === "station") {
      const d = days.find(x => x.n === b.day);
      return `${t("day.n", { n: b.day ?? 1 })} · ${b.name}${d && (d.title || d.auto) ? ` · ${d.title || d.auto}` : ""}`;
    }
    if (b.kind === "home") return `🏠 ${t("route.home", { place: b.name })}`;
    return `→ ${b.name}`;
  }
  /** Tage an einer Station: Überschriften und eigene Einträge kurz hintereinander */
  function stationDays(s: RSeg): string[] {
    const b = route.points[s.b];
    if (b.kind !== "station" || !b.day) return [];
    return days.filter(d => d.n > b.day! && d.n < b.day! + (b.nights || 0)).map(d => `${t("day.n", { n: d.n })} · ${b.name}${d.title ? ` · ${d.title}` : d.entries.length ? ` · ${d.entries.filter(e => e.kind !== "stay").map(e => e.text).slice(0, 2).join(", ")}` : ""}`);
  }

  async function play(onframe?: () => void) {
    if (!map || playing) return;
    playing = true; stop = false;
    const done: { mode: string; c: [number, number][] }[] = [];
    const src = map.getSource("done") as import("maplibre-gl").GeoJSONSource;
    src.setData(fc([]));
    const veh = document.createElement("div"); veh.className = "rm-veh";
    const vm = new lib!.Marker({ element: veh }).setLngLat([route.points[0].lon, route.points[0].lat]).addTo(map);
    const tick = (ms: number) => new Promise<void>(res => { const t0 = performance.now(); const f = () => { onframe?.(); if (performance.now() - t0 >= ms || stop) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    try {
      for (const s of route.segs) {
        if (stop) break;
        const c = coords(s);
        const a = route.points[s.a], b = route.points[s.b];
        veh.textContent = s.mode === "flight" ? "✈️" : b.kind === "home" ? "🚗" : "🚆";
        caption = captionFor(s);
        fit(1100, [c[0], c.at(-1)!]);
        await tick(1200);
        const km = kmBetween(a, b), dur = Math.min(3200, 900 + km * 1.6), t0 = performance.now();
        await new Promise<void>(res => {
          const f = () => {
            const k = Math.min(1, (performance.now() - t0) / dur), i = Math.max(1, Math.round(k * (c.length - 1)));
            src.setData(fc([...done, { mode: s.mode, c: c.slice(0, i + 1) }]));
            vm.setLngLat(c[i]);
            onframe?.();
            if (k >= 1 || stop) res(); else requestAnimationFrame(f);
          };
          requestAnimationFrame(f);
        });
        done.push({ mode: s.mode, c });
        if (b.kind === "station") { await tick(1300); for (const line of stationDays(s)) { if (stop) break; caption = line; await tick(1100); } }
      }
      caption = sub || title;
      fit(1400);
      await tick(1800);
    } finally {
      vm.remove();
      playing = false;
      if (!recording) setTimeout(() => (caption = ""), 1500);
    }
  }

  async function video() {
    if (!map || playing) return;
    const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
    const mime = types.find(x => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(x));
    if (!mime) { busy = t("route.noVideo"); await wait(2500); busy = ""; return; }
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1350;
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    const ended = new Promise<void>(r => (rec.onstop = () => r()));
    recording = true;
    const back = await shape(cv.width, cv.height);
    compose(cv, cv.width, cv.height, caption);
    rec.start(200);
    try { await play(() => compose(cv, cv.width, cv.height, caption)); }
    finally { rec.stop(); await ended; recording = false; back(); }
    await save(new Blob(parts, { type: mime.split(";")[0] }), `${slug(title)}.${mime.includes("mp4") ? "mp4" : "webm"}`);
  }
</script>

<div class="rmap">
  <div class="mapbox rm-box" bind:this={box} role="region" aria-label={t("route.map")}>
    {#if failed}<p class="muted small map-fail">{t("map.failed")}</p>{/if}
    {#if caption}<div class="rm-cap" aria-live="polite">{caption}</div>{/if}
  </div>
  <div class="rm-acts">
    <button class="btn sm primary rm-play" disabled={!ready || playing} onclick={() => play()}>▶ {t("route.play")}</button>
    {#if playing && !recording}<button class="btn sm" onclick={() => (stop = true)}>■ {t("route.stop")}</button>{/if}
    <button class="btn sm rm-img" disabled={!ready || playing} onclick={shareImage}>📷 {t("route.image")}</button>
    <button class="btn sm rm-vid" disabled={!ready || playing} onclick={video}>🎬 {recording ? t("route.recording") : t("route.video")}</button>
    {#if busy}<span class="muted small">{busy}</span>{/if}
  </div>
</div>

<style>
  .rmap { display: flex; flex-direction: column; gap: 8px; }
  .rm-box { position: relative; height: min(460px, 62vh); }
  .rm-acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .rm-cap { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 3; background: rgba(14, 36, 56, .88); color: #fff; font-weight: 700; font-size: 15px; padding: 8px 14px; border-radius: 99px; max-width: 90%; text-align: center; pointer-events: none; }
  :global(.rm-pin) { font: 700 12px/1 inherit; font-family: inherit; padding: 5px 8px; border-radius: 999px; background: #fff; color: #15202E; box-shadow: 0 2px 6px rgba(0,0,0,.25); white-space: nowrap; border: 2px solid #C2457A; }
  :global(.rm-pin.rm-home) { border-color: #5B6B7D; }
  :global(.rm-veh) { font-size: 22px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.4)); }
</style>
