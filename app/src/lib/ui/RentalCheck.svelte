<script lang="ts">
  /* Mietwagen-Checkliste am Posten (#172): Kaution, Selbstbeteiligung, Tank, junge Fahrer; allgemeine Hinweise, keine Beratung */
  import { t } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { app } from "../store.svelte";
  import { RENTAL, isRental, youngDrivers } from "../fees";
  import { money } from "../calc";

  let { item }: { item: Item } = $props();
  const young = $derived(isRental(item) ? youngDrivers(item, app.trip) : []);
  const tooYoung = $derived(young.filter(p => Number(p.age) < RENTAL.youngMin));
  const who = (ps: typeof young) => ps.map(p => `${p.name} (${p.age})`).join(", ");
</script>

{#if isRental(item)}
  <details class="rc" data-rc={item.id}>
    <summary>📋 {t("rent.title")}</summary>
    <ul>
      <li>🔒 {t("rent.deposit", { a: money(RENTAL.depositMin, "EUR"), b: money(RENTAL.depositMax, "EUR") })}</li>
      <li>🛡 {t("rent.cover")}</li>
      <li>⛽ {t("rent.fuel")}</li>
      <li>👤 {t("rent.young", { a: RENTAL.youngUnder, b: RENTAL.youngMin })}{#if young.length} <b>{t("rent.youngWho", { who: who(young) })}</b>{/if}{#if tooYoung.length} <b class="rc-warn">{t("rent.tooYoung", { who: who(tooYoung), b: RENTAL.youngMin })}</b>{/if}</li>
      <li>👥 {t("rent.more")}</li>
      <li>📷 {t("rent.photos")}</li>
    </ul>
    <p class="muted small">ⓘ {t("rent.binding")}</p>
  </details>
{/if}

<style>
  .rc { margin: 0 22px 12px; border-top: 1px dashed var(--line); padding-top: 8px; font-size: 13px; }
  .rc summary { cursor: pointer; font-weight: 700; }
  .rc ul { list-style: none; margin: 8px 0 4px; padding: 0; display: grid; gap: 6px; }
  .rc-warn { color: var(--warn); }
  .rc p { margin: 4px 0 0; }
</style>
