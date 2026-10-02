<script lang="ts">
  /*
   * Filterleiste der Unterkunftssuche: Preis pro Person und Nacht, Bewertung, Sterne, Zentrum, Frühstück,
   * Ausstattung und Quelle als Chips mit Anzahl und Preis ab. Filtert die vorhandenen Treffer, keine neue Anfrage.
   */
  import { t, tn } from "../i18n/index.svelte";
  import { eur } from "../calc";
  import { noStayFilter, stayActive, stayFacets, type StayCtx, type StayFilter } from "../stays/filter";
  import type { StayOffer } from "../stays/types";

  let { list, filter = $bindable(), ctx }: { list: StayOffer[]; filter: StayFilter; ctx: StayCtx } = $props();

  const fc = $derived(stayFacets(list, filter, ctx));
  const active = $derived(stayActive(filter));
  const meta = (c: number, min: number) => `${c} · ${t("fs.cal.from", { v: eur(min) })}`;
  const SRC: Record<string, string> = { booking: "Booking.com", trivago: "Trivago" };
  const toggleFact = (x: string) => (filter.facts = filter.facts.includes(x) ? filter.facts.filter(y => y !== x) : [...filter.facts, x]);
  const toggleSrc = (x: string) => (filter.sources = filter.sources.includes(x) ? filter.sources.filter(y => y !== x) : [...filter.sources, x]);
  // Regler pro Person und Nacht: ganz rechts heißt egal
  let ppnMax = $state(0);
  $effect(() => { if (filter.maxPpn == null && fc.ppn) ppnMax = fc.ppn.hi; });
  $effect(() => { const v = ppnMax; filter.maxPpn = fc.ppn && v && v < fc.ppn.hi ? v : null; });
</script>

<div class="ff sf">
  {#if fc.ppn && fc.ppn.hi > fc.ppn.lo}
    <label class="f ff-hours sf-ppn"><span class="dual-head"><span class="dlabel">{t("sf.ppn")}</span><b class="num">{filter.maxPpn != null ? t("sf.upTo", { v: eur(filter.maxPpn) }) : t("st.any")}</b></span>
      <input type="range" min={fc.ppn.lo} max={fc.ppn.hi} step="5" bind:value={ppnMax} aria-label={t("sf.ppn")} /></label>
  {/if}
  <div class="chips sf-row">
    {#each fc.score as x (x.key)}
      <button type="button" class="chip sm" class:on={filter.minScore === x.key} aria-pressed={filter.minScore === x.key} onclick={() => (filter.minScore = filter.minScore === x.key ? null : x.key)}>{t("st.scoreFrom", { n: x.key })} <small>{meta(x.count, x.min)}</small></button>
    {/each}
    {#each fc.km as x (x.key)}
      <button type="button" class="chip sm" class:on={filter.maxKm === x.key} aria-pressed={filter.maxKm === x.key} onclick={() => (filter.maxKm = filter.maxKm === x.key ? null : x.key)}>{t("sf.km", { n: x.key })} <small>{meta(x.count, x.min)}</small></button>
    {/each}
    {#each fc.breakfast as x (String(x.key))}
      <button type="button" class="chip sm" class:on={filter.breakfast} aria-pressed={filter.breakfast} onclick={() => (filter.breakfast = !filter.breakfast)}>{t("st.m.breakfast")} <small>{meta(x.count, x.min)}</small></button>
    {/each}
  </div>
  <details class="fs-more ff-more">
    <summary><b>{t("fs.f.more")}</b>{#if active}<span class="pill-n">{tn("fs.f.active", active)}</span>{/if}</summary>
    {#if fc.stars.length}
      <div class="chips sf-row">
        {#each fc.stars as x (x.key)}
          <button type="button" class="chip sm" class:on={filter.minStars === x.key} aria-pressed={filter.minStars === x.key} onclick={() => (filter.minStars = filter.minStars === x.key ? null : x.key)}>{t("st.starsFrom", { n: x.key })} <small>{meta(x.count, x.min)}</small></button>
        {/each}
      </div>
    {/if}
    {#if fc.facts.length}
      <div class="chips sf-row">
        {#each fc.facts as x (x.key)}
          <button type="button" class="chip sm" class:on={filter.facts.includes(x.key)} aria-pressed={filter.facts.includes(x.key)} onclick={() => toggleFact(x.key)}>{x.key} <small>{meta(x.count, x.min)}</small></button>
        {/each}
      </div>
    {/if}
    {#if fc.sources.length > 1}
      <div class="chips sf-row">
        {#each fc.sources as x (x.key)}
          <button type="button" class="chip sm" class:on={filter.sources.includes(x.key)} aria-pressed={filter.sources.includes(x.key)} onclick={() => toggleSrc(x.key)}>{SRC[x.key] || x.key} <small>{meta(x.count, x.min)}</small></button>
        {/each}
      </div>
    {/if}
    {#if active}<button type="button" class="btn sm ff-reset" onclick={() => (filter = noStayFilter())}>{t("fs.f.reset")}</button>{/if}
  </details>
</div>
