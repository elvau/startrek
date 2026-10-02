<script lang="ts" generics="T extends Filterable">
  /*
   * Filterleiste der Flugsuche: Umstiege, Abflughafen, Airline als Chips mit Anzahl und Preis ab,
   * Abflugzeiten und Flugdauer als Regler. Filtert die vorhandenen Treffer, keine neue Anfrage.
   */
  import { t, tn } from "../i18n/index.svelte";
  import { eur } from "../calc";
  import DualRange from "./DualRange.svelte";
  import { activeCount, facets, noFilter, type Filterable, type FlightFilter } from "../flights/filter";

  let { list, filter = $bindable(), returns }: { list: T[]; filter: FlightFilter; returns: boolean } = $props();

  const fc = $derived(facets(list, filter));
  const active = $derived(activeCount(filter));
  let open = $state(false);
  const toggle = (k: "origins" | "airlines", v: string) => (filter[k] = filter[k].includes(v) ? filter[k].filter(x => x !== v) : [...filter[k], v]);
  const meta = (c: number, min: number) => `${c} · ${t("fs.cal.from", { v: eur(min) })}`;
  function reset() { filter = { ...noFilter(), outDay: filter.outDay, backDay: filter.backDay }; }
  // Regler „höchstens … h“: ganz rechts heißt egal
  let hoursHi = $state(0);
  $effect(() => { if (filter.maxHours == null) hoursHi = fc.longest; });
  $effect(() => { const h = hoursHi; filter.maxHours = h && h < fc.longest ? h : null; });
</script>

<div class="ff">
  <div class="chips ff-stops" aria-label={t("fs.f.stopsLabel")}>
    {#each fc.stops as s (s.key)}
      <button type="button" class="chip" class:on={filter.stops === s.key} aria-pressed={filter.stops === s.key}
        onclick={() => (filter.stops = filter.stops === s.key ? null : s.key)}>{s.key ? tn("fs.f.upTo", s.key) : t("fs.f.direct")} <small>{meta(s.count, s.min)}</small></button>
    {/each}
  </div>
  {#if fc.origins.length > 1}
    <div class="chips ff-origins" aria-label={t("fs.th.from")}>
      {#each fc.origins as o (o.key)}
        <button type="button" class="chip sm" class:on={filter.origins.includes(o.key)} aria-pressed={filter.origins.includes(o.key)} onclick={() => toggle("origins", o.key)}>{o.key} <small>{meta(o.count, o.min)}</small></button>
      {/each}
    </div>
  {/if}
  <details class="fs-more ff-more" bind:open>
    <summary><b>{t("fs.f.more")}</b>{#if active}<span class="pill-n">{tn("fs.f.active", active)}</span>{/if}</summary>
    {#if fc.airlines.length > 1}
      <div class="chips ff-airlines" aria-label={t("fs.f.airlines")}>
        <span class="muted small">{t("fs.f.airlines")}</span>
        {#each fc.airlines.slice(0, 12) as a (a.key)}
          <button type="button" class="chip sm" class:on={filter.airlines.includes(a.key)} aria-pressed={filter.airlines.includes(a.key)} onclick={() => toggle("airlines", a.key)}>{a.key} <small>{meta(a.count, a.min)}</small></button>
        {/each}
      </div>
    {/if}
    <div class="ff-ranges">
      <DualRange bind:lo={filter.outDep[0]} bind:hi={filter.outDep[1]} min={0} max={24} label={t("fs.f.outDep")} unit={t("fs.f.oclock")} />
      {#if returns}<DualRange bind:lo={filter.backDep[0]} bind:hi={filter.backDep[1]} min={0} max={24} label={t("fs.f.backDep")} unit={t("fs.f.oclock")} />{/if}
      {#if fc.longest > 1}
        <label class="f ff-hours"><span class="dual-head"><span class="dlabel">{t("fs.f.maxHours")}</span><b class="num">{hoursHi < fc.longest ? t("fs.f.hoursMax", { n: hoursHi }) : t("st.any")}</b></span>
          <input type="range" min="1" max={fc.longest} step="1" bind:value={hoursHi} /></label>
      {/if}
    </div>
    {#if active}<button type="button" class="btn sm ff-reset" onclick={reset}>{t("fs.f.reset")}</button>{/if}
  </details>
</div>
