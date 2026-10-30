<script lang="ts">
  /* Mietwagen am Posten (#391): Mietzeitraum (Schnellwahl und Kalender) und Fahrzeugklasse; ändert nur den geschätzten Preis */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { access, app } from "../store.svelte";
  import { eur } from "../calc";
  import { isRental } from "../fees";
  import { carWindow } from "../extras";
  import { CAR_CLASSES, CLASS_KEYS, QUICK_DAYS, quickOf, quickRange, rentalDays, setRental, type CarClass } from "../carclass";
  import DateRange from "./DateRange.svelte";
  import PartnerLinks from "./PartnerLinks.svelte";
  import { partnersOf, sponsoredAny } from "../partners";
  import { partner } from "../partnerState.svelte";

  let { item }: { item: Item } = $props();
  const w = $derived(carWindow(app.trip));
  const r = $derived(item.rental);
  const cls = $derived<CarClass>(r?.cls || "compact");
  const est = $derived(item.options.find(o => o.estimate && o.price.mode === "unit"));
  const days = $derived(rentalDays(r, w) ?? est?.price.qty ?? null);
  const quick = $derived(quickOf(r, w, app.trip));
  // Link zum Vergleichen mit dem gewählten Zeitraum (Uhrzeiten aus dem Mietfenster der Flüge, sonst 10 Uhr)
  const linkW = $derived.by(() => {
    if (!r?.from || !r.to) return w;
    const tm = (iso: string | undefined, d: string) => (iso && iso.slice(0, 10) === d ? iso : `${d}T10:00`);
    return { ...(w?.ap ? { ap: w.ap } : {}), ...(w?.dropAp ? { dropAp: w.dropAp } : {}), pick: tm(w?.pick, r.from), drop: tm(w?.drop, r.to), days: days || 1 };
  });
  function pickQuick(n: number) {
    const x = quickRange(n, r, w, app.trip);
    if (x) setRental(item, x, w);
  }
  let from = $state(""), to = $state("");
  $effect(() => { from = r?.from || ""; to = r?.to || ""; });
</script>

{#if isRental(item)}
  <div class="rp" data-rp={item.id}>
    {#if access.readonly}
      <p class="muted small">{t(`car.cls.${cls}` as Key)}{days ? ` · ${tn("n.days", days)}` : ""}</p>
    {:else}
      <div class="rp-row">
        <span class="rp-l">{t("car.period")}</span>
        <div class="rp-chips">
          {#each QUICK_DAYS as n (n)}<button type="button" class="chip" class:on={quick === n} onclick={() => pickQuick(n)}>{n ? tn("n.days", n) : t("car.whole")}</button>{/each}
        </div>
      </div>
      <DateRange bind:from bind:to unit="rent" cls="rp-dr" label="" fromLabel={t("car.pick")} toLabel={t("car.drop")} onchange={(a, b) => setRental(item, { from: a, to: b }, w)} />
      <div class="rp-row">
        <span class="rp-l">{t("car.class")}</span>
        <div class="rp-chips">
          {#each CLASS_KEYS as k (k)}
            <button type="button" class="chip rp-cls" class:on={cls === k} title={tn("car.seats", CAR_CLASSES[k].seats)} onclick={() => setRental(item, { cls: k }, w)}>{t(`car.cls.${k}` as Key)}</button>
          {/each}
        </div>
      </div>
      <p class="muted small rp-how">
        {#if est && days}{t("car.estLine", { v: eur(est.price.unit || 0), d: tn("n.days", days), s: tn("car.seats", CAR_CLASSES[cls].seats) })}
        {:else}{t("car.realNote")}{/if}
      </p>
      <p class="muted small rp-links">{t("car.compare")} <PartnerLinks ids={partnersOf("car")} q={{ w: linkW, place: app.trip.place || "" }} /></p>
      {#if sponsoredAny(partnersOf("car"), { w: linkW, place: app.trip.place || "" }, partner.on)}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
    {/if}
  </div>
{/if}

<style>
  .rp { margin: 0 22px 12px; display: flex; flex-direction: column; gap: 6px; }
  .rp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .rp-l { font-size: 12.5px; font-weight: 700; color: var(--ink-2); min-width: 90px; }
  .rp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .rp-how, .rp-links { margin: 0; }
</style>
