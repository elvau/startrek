<script lang="ts" module>
  /** Punkt auf der Karte: Unterkunft (mit Preis), Flughafen oder Erlebnis */
  export interface MapPoint { id: string; lat: number; lon: number; kind: "stay" | "airport" | "event"; label: string; title?: string }
</script>

<script lang="ts">
  /*
   * Karte ohne Google: MapLibre mit freien OpenStreetMap-Kacheln von OpenFreeMap (ohne Schlüssel, ohne Cookies).
   * Die Bibliothek wird erst geladen, wenn die Karte aufgeht.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { t } from "../i18n/index.svelte";
  import type { Map as MlMap, Marker } from "maplibre-gl";

  let { points, selected = null, onselect, onbounds }: {
    points: MapPoint[]; selected?: string | null; onselect?: (id: string) => void;
    /** sichtbarer Ausschnitt nach jedem Verschieben oder Zoomen */
    onbounds?: (b: { w: number; s: number; e: number; n: number }) => void;
  } = $props();

  const STYLE = "https://tiles.openfreemap.org/styles/liberty";
  let box: HTMLDivElement;
  let map: MlMap | undefined;
  let lib: typeof import("maplibre-gl") | undefined;
  let markers: { id: string; m: Marker; el: HTMLElement }[] = [];
  let failed = $state(false);
  let fitted = "";

  async function init() {
    try {
      const [m] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
      lib = m;
      if (!box) return;
      map = new m.Map({ container: box, style: STYLE, center: [0, 30], zoom: 1.5, attributionControl: { compact: true }, cooperativeGestures: true });
      map.addControl(new m.NavigationControl({ showCompass: false }), "top-right");
      map.on("moveend", () => { const b = map!.getBounds(); onbounds?.({ w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() }); });
      draw();
    } catch { failed = true; }
  }
  onMount(() => { void init(); });
  onDestroy(() => map?.remove());

  function draw() {
    if (!map || !lib) return;
    for (const x of markers) x.m.remove();
    markers = points.map(p => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `map-pin map-${p.kind}`;
      el.textContent = p.label;
      if (p.title) el.title = p.title;
      el.setAttribute("aria-label", p.title || p.label);
      el.dataset.id = p.id;
      if (p.id === selected) el.classList.add("on");
      if (p.kind === "stay") el.addEventListener("click", e => { e.stopPropagation(); onselect?.(p.id); });
      const m = new lib!.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map!);
      return { id: p.id, m, el };
    });
    // Ausschnitt nur anpassen, wenn sich die Punkte ändern (nicht bei jeder Auswahl)
    const key = points.map(p => p.id).join();
    if (key === fitted || !points.length) return;
    fitted = key;
    const b = new lib.LngLatBounds();
    for (const p of points) b.extend([p.lon, p.lat]);
    map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 });
  }
  // neu zeichnen, wenn sich die Punkte ändern
  $effect(() => { void points; untrack(draw); });
  $effect(() => {
    for (const x of markers) x.el.classList.toggle("on", x.id === selected);
    const s = selected && markers.find(x => x.id === selected);
    if (s && map && !map.getBounds().contains(s.m.getLngLat())) map.panTo(s.m.getLngLat());
  });
</script>

<div class="mapbox" bind:this={box} role="region" aria-label={t("map.title")}>
  {#if failed}<p class="muted small map-fail">{t("map.failed")}</p>{/if}
</div>
