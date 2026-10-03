<script lang="ts">
  /* Reiseroute als kleines Bild ohne Karte (Startseite, Vorschau): Flüge als Bögen, Weiterreise als Linie, Stationen als Punkte */
  import { arc, focus, project, type Route } from "../route";

  let { route, w = 160, h = 72, label = "" }: { route: Route; w?: number; h?: number; label?: string } = $props();
  const pr = $derived(project(focus(route), w, h, 14));
  const path = (i: number) => {
    const s = route.segs[i], a = route.points[s.a], b = route.points[s.b];
    const pts = s.mode === "flight" ? arc(a, b, 16).map(([lon, lat]) => pr({ lat, lon })) : [pr(a), pr(b)];
    return "M" + pts.map(p => p.map(v => v.toFixed(1)).join(" ")).join("L");
  };
</script>

{#if route.points.length > 1}
  <svg class="rmini" viewBox="0 0 {w} {h}" width={w} height={h} role="img" aria-label={label}>
    {#each route.segs as s, i (i)}<path d={path(i)} class="rm-{s.mode}" />{/each}
    {#each route.points as p, i (i)}
      {@const [x, y] = pr(p)}
      {#if p.kind === "station"}<circle cx={x} cy={y} r="3.6" class="rm-st" />{:else if p.kind === "home"}<circle cx={x} cy={y} r="2.6" class="rm-home" />{/if}
    {/each}
  </svg>
{/if}

<style>
  .rmini { display: block; overflow: hidden; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .rm-flight { stroke: var(--c-flights); stroke-width: 1.8; stroke-dasharray: 3 3; }
  .rm-ground { stroke: var(--c-transport); stroke-width: 2.2; }
  .rm-st { fill: var(--c-stay); stroke: var(--paper); stroke-width: 1.4; }
  .rm-home { fill: var(--ink-2); }
</style>
