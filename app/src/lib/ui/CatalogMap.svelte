<script lang="ts">
  /*
   * Karte im Reisekatalog (#646, Dani 02.11.: Karte mit dem Zielland statt Bildern): Ausschnitt über das Zielland
   * (Städte des Landes im Umkreis der Stationen), darauf die Stationen und die Strecke zwischen ihnen.
   * Kartenbild wie im Mini-Bild der Route (mapSnap, OpenFreeMap), einmal gerendert und zwischengespeichert.
   */
  import { mapView, project, type LatLon } from "../route";
  import { cachedSnap, mapSnap } from "./mapSnap";

  let { stops, area = [], w = 360, h = 144 }: { stops: LatLon[]; area?: LatLon[]; w?: number; h?: number } = $props();
  const PAD = 18;
  const pts = $derived([...area, ...stops]);
  const pr = $derived(project(pts, w, h, PAD));
  const view = $derived(mapView(pts, w, h, PAD));
  let bg = $state<string | null>(null);
  // Kartenbild erst rendern, wenn die Karte ins Bild kommt (lange Liste, eine unsichtbare Karte rendert nacheinander)
  let el = $state<SVGSVGElement>();
  let seen = $state(false);
  $effect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { seen = true; return; }
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { seen = true; io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  });
  $effect(() => {
    const v = view;
    if (!v) { bg = null; return; }
    if (!seen) { bg = cachedSnap(v, w, h) ?? null; return; }
    bg = cachedSnap(v, w, h) ?? null;
    if (bg) return;
    let live = true;
    void mapSnap(v, w, h).then(u => { if (live) bg = u; });
    return () => { live = false; };
  });
  const line = $derived(stops.length > 1 ? "M" + stops.map(p => pr(p).map(v => v.toFixed(1)).join(" ")).join("L") : "");
</script>

<svg bind:this={el} class="kmap" class:on={!!bg} viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  {#if bg}<image href={bg} x="0" y="0" width={w} height={h} preserveAspectRatio="none" />
  {:else}{#each area as c, i (i)}{@const [x, y] = pr(c)}<circle cx={x} cy={y} r={w / 160} class="km-city" />{/each}{/if}
  {#if line}<path d={line} class="km-line" />{/if}
  {#each stops as p, i (i)}
    {@const [x, y] = pr(p)}
    <circle cx={x} cy={y} r={w / 36} class="km-halo" /><circle cx={x} cy={y} r={w / 64} class="km-st" />
  {/each}
</svg>

<style>
  .kmap { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .kmap:not(.on) { opacity: .9; }
  /* ohne Kartenbild: Städte des Ziellands als Punkte, zeigen die Umrisse */
  .km-city { fill: var(--k, var(--a)); opacity: .28; }
  .km-line { fill: none; stroke: var(--k, var(--a)); stroke-width: 3; stroke-dasharray: 6 5; stroke-linecap: round; }
  .km-halo { fill: color-mix(in srgb, var(--k, var(--a)) 25%, transparent); }
  .km-st { fill: var(--k, var(--a)); stroke: #fff; stroke-width: 2; }
</style>
