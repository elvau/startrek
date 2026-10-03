<script lang="ts">
  /*
   * Einreise & Tipps: Hinweise je Reiseland und je besonderem Ort mit Links zu offiziellen Stellen; Gebühren vor Ort
   * (Galápagos) lassen sich als Posten übernehmen. Links öffnen erst beim Antippen.
   */
  import { t, type Key } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { GENERAL_LINKS, hintsFor, tripCountries, type Hint } from "../hints";
  import { itinerary } from "../itinerary";
  import { airportData, geo } from "../geo/geo.svelte";
  import { ccOf } from "../geo/places";
  import { locOf } from "../geo/locations";
  import { uid } from "../model";
  import { showItem } from "./showItem";
  import { reveal } from "./reveal";

  const countries = $derived(tripCountries(app.trip, n => (n ? ccOf(geo, n) : null), c => locOf(airportData, c, "airport")?.cc));
  const places = $derived([...new Set(itinerary(app.trip).map(d => d.place).filter(Boolean))]);
  const list = $derived(hintsFor(app.trip, countries, places));
  const flag = (cc: string) => String.fromCodePoint(...[...cc].map(c => 0x1f1a5 + c.charCodeAt(0)));
  const has = (h: Hint) => app.trip.items.some(i => i.hint === h.id);
  function addFee(h: Hint) {
    if (!h.fee || has(h)) return;
    setDetailed(h.fee.cat, true);
    const it = { id: uid(), cat: h.fee.cat, name: t(`hint.${h.id}.t` as Key), status: "idea" as const, hint: h.id,
      options: [{ id: uid(), label: t("hint.estimate"), estimate: true, price: { mode: "person" as const, currency: h.fee.currency, adult: h.fee.adult, ...(h.fee.child != null ? { child: h.fee.child, infant: h.fee.child } : {}) } }] };
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#if list.length || countries.length}
  <article class="card hints" use:reveal>
    <h3>🛂 {t("hint.title")}</h3>
    <p class="muted small">{t("hint.lead")}</p>
    {#if list.length}
      <ul class="hn-list">
        {#each list as h (h.id)}
          <li class="hn hn-{h.kind}">
            <b>{#if h.cc}{flag(h.cc[0])} {/if}{t(`hint.${h.id}.t` as Key)}</b>
            <span>{t(`hint.${h.id}.x` as Key)}</span>
            <span class="hn-links">
              {#each h.links as l (l.url)}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{/each}
              {#if h.fee && !access.readonly}{#if has(h)}<small class="muted">✓ {t("hint.feeAdded")}</small>{:else}<button class="linkbtn hn-fee" onclick={() => addFee(h)}>+ {t("hint.fee")}</button>{/if}{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="small hn-general">{t("hint.general")}
      {#each GENERAL_LINKS as l (l.url)} <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{/each}</p>
  </article>
{/if}

<style>
  .hints { padding: 14px 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; border-inline-start: 4px solid var(--c-trav, var(--c-plan)); }
  .hints h3 { margin: 0; font-size: 17px; }
  .hints p { margin: 0; }
  .hn-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .hn { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
  .hn-links { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; }
  .hn-general { color: var(--ink-2); }
  .hn-general a { margin-inline-start: 6px; }
</style>
