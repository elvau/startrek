<script lang="ts">
  /*
   * Angebote eines Postens vergleichen (#441), für Erlebnisse und andere Posten außer Flug und Unterkunft:
   * Buchstaben A, B, C, Preis und Abstand, ganze Reise pro Person, Entfernung zur Unterkunft und zum Zentrum (mit Lage).
   */
  import { t, tn } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { calcOption, eur } from "../calc";
  import { geo } from "../geo/geo.svelte";
  import { hasCoords } from "../geo/maps";
  import { kmText } from "../geo/spots";
  import { distances, effectOf, letter, nearestTo, refPoints } from "../stays/compare";

  let { item }: { item: Item } = $props();
  const r = $derived(calc.T.items[item.id]);
  const sel = $derived(r?.option?.id);
  const eff = $derived.by(() => { void geo.world.length; return Object.fromEntries(item.options.map(o => [o.id, effectOf(app.trip, item.id, o.id, geo)])); });
  const cur = $derived(sel ? eff[sel] : undefined);
  // Unterkunft und Zentrum als Bezug, nur wenn mindestens ein Angebot eine Lage hat
  const refs = $derived.by(() => { void geo.world.length; void Object.keys(geo.packs).length; return item.options.some(o => hasCoords(o.loc)) ? refPoints(app.trip, geo, item, true).filter(x => x.kind === "center" || x.kind === "stay").slice(0, 3) : []; });
  const dist = $derived(distances(item.options, refs));
  const near = $derived(nearestTo(dist, refs));
  const refName = (x: (typeof refs)[number]) => (x.kind === "center" ? t("stc.center", { name: x.name }) : x.name.length > 24 ? x.name.slice(0, 23) + "…" : x.name);

  function choose(id: string, e: Event) {
    e.stopPropagation();
    if (access.readonly) return;
    item.chosen = id;
  }
</script>

<div class="opts oc">
  <div class="opts-h"><span>{t("fl.compare")}</span><span>{tn("n.offers", item.options.length)}</span></div>
  {#each item.options as o, i (o.id)}
    {@const c = calcOption(o, item, app.trip)}
    {@const diff = c.net - (r?.net || 0)}
    {@const e = eff[o.id]}
    {@const dd = e && cur ? e.total - cur.total : 0}
    {@const d = dist[o.id]}
    <button class="opt oc-row" class:sel={o.id === sel} onclick={ev => choose(o.id, ev)} disabled={access.readonly}>
      <span class="cmp-l" aria-hidden="true">{letter(i)}</span>
      <span class="oc-main">{o.label || t("ie.offerN", { n: i + 1 })}
        {#if o.detail}<small>{o.detail}</small>{/if}
        {#if d && refs.length}<small>{#each refs as x, k (x.id)}{k ? " · " : ""}<span class:best={near[x.id] === o.id}>{x.kind === "stay" ? "🛏" : "📍"} {refName(x)} {kmText(d[x.id])}</span>{/each}</small>{/if}
      </span>
      <span class="num oc-p">{eur(c.net)} {#if o.id !== sel && Math.round(diff)}<span class="d" class:down={diff < 0} class:up={diff > 0}>{diff > 0 ? "+" : "−"}{Math.abs(Math.round(diff))}</span>{/if}
        {#if e && e.people > 1 && o.id !== sel && Math.round(dd)}<small class="d" class:down={dd < 0} class:up={dd > 0}>{t("fl.tripPP", { v: `${dd > 0 ? "+" : "−"}${eur(Math.abs(dd) / e.people)}` })}</small>{/if}
        {#if o.id === sel}<small class="oc-sel">✓ {t("st.chosen")}</small>{/if}</span>
    </button>
  {/each}
</div>

<style>
  .oc-row { align-items: start; }
  .oc-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .oc-main .best { color: var(--good); font-weight: 700; }
  .cmp-l { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; background: var(--ink-3); }
  .oc-row.sel .cmp-l { background: var(--a); }
  .oc-p { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .oc-sel { color: var(--a); font-weight: 700; }
</style>
