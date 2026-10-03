<script lang="ts">
  /* Reiseroute als kleines Bild (Startseite, Vorschau): Kartenbild darunter, Flüge als Bögen, Weiterreise als Linie, Stationen als Punkte */
  import { arc, focus, mapView, project, type Route } from "../route";
  import { cachedSnap, mapSnap } from "./mapSnap";

  let { route, w = 160, h = 72, label = "" }: { route: Route; w?: number; h?: number; label?: string } = $props();
  const PAD = 14;
  const clip = `rmc-${Math.random().toString(36).slice(2, 8)}`;
  const pr = $derived(project(focus(route), w, h, PAD));
  const view = $derived(mapView(focus(route), w, h, PAD));
  let bg = $state<string | null>(null);
  $effect(() => {
    const v = view;
    if (!v) { bg = null; return; }
    bg = cachedSnap(v, w, h) ?? null;
    if (bg) return;
    let live = true;
    void mapSnap(v, w, h).then(u => { if (live) bg = u; });
    return () => { live = false; };
  });
  const path = (i: number) => {
    const s = route.segs[i], a = route.points[s.a], b = route.points[s.b];
    const pts = s.mode === "flight" ? arc(a, b, 16).map(([lon, lat]) => pr({ lat, lon })) : [pr(a), pr(b)];
    return "M" + pts.map(p => p.map(v => v.toFixed(1)).join(" ")).join("L");
  };
</script>

{#if route.points.length > 1}
  <svg class="rmini" class:map={!!bg} viewBox="0 0 {w} {h}" width={w} height={h} role="img" aria-label={label}>
    <!-- nichts außerhalb des Ausschnitts zeichnen, auch wenn das Bild schmaler skaliert wird -->
    <clipPath id={clip}><rect width={w} height={h} /></clipPath>
    <g clip-path="url(#{clip})">
      {#if bg}<image href={bg} x="0" y="0" width={w} height={h} preserveAspectRatio="none" />{/if}
      {#each route.segs as s, i (i)}<path d={path(i)} class="rm-{s.mode}" />{/each}
      {#each route.points as p, i (i)}
        {@const [x, y] = pr(p)}
        {#if p.kind === "station"}<circle cx={x} cy={y} r="3.6" class="rm-st" />{:else if p.kind === "home"}<circle cx={x} cy={y} r="2.6" class="rm-home" />{/if}
      {/each}
    </g>
  </svg>
{/if}

<style>
  .rmini { display: block; overflow: hidden; }
  .rmini.map { border-radius: 10px; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .rm-flight { stroke: #2F6FE4; stroke-width: 1.8; stroke-dasharray: 3 3; }
  .rm-ground { stroke: #1F9E7A; stroke-width: 2.4; }
  .rm-st { fill: #C2457A; stroke: #fff; stroke-width: 1.4; }
  .rm-home { fill: #4a4a4a; stroke: #fff; stroke-width: 1; }
</style>
