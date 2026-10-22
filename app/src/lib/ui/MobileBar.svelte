<script lang="ts">
  /*
   * Handy (#530): feste Leiste unten mit allen Seiten der Reise (Übersicht, Kapitel, Tage, Abrechnung) zum Wechseln und
   * rechts der Gesamtsumme. Antippen der Summe öffnet „Mehr“: Fehler melden, Kostenübersicht und Fußzeile (Anleitung,
   * Impressum …). Oben bleibt nur die Kopfzeile.
   */
  import { t } from "../i18n/index.svelte";
  import { calc } from "../store.svelte";
  import { eur } from "../calc";
  import { CHAPTERS } from "../chapters";
  import { goPage, mob, PAGES } from "../mobile.svelte";
  import { bugDialog } from "../bugs/app.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { FLIGHTS_URL } from "../flights/app";
  import TicketAside from "./TicketAside.svelte";
  import Icon from "./Icon.svelte";
  import AppFooter from "./AppFooter.svelte";

  let row = $state<HTMLElement>();
  const label = (k: string) => (k === "hero" ? t("mob.home") : CHAPTERS.find(c => c.k === k)?.label || k);
  const icon = (k: string) => (k === "hero" ? "home" : CHAPTERS.find(c => c.k === k)?.icon || "");
  // aktive Seite in der Leiste sichtbar halten (nur die Leiste verschieben)
  $effect(() => {
    const a = row?.querySelector<HTMLElement>(`[data-pg="${mob.page}"]`);
    if (row && a) row.scrollTo({ left: a.offsetLeft - (row.clientWidth - a.offsetWidth) / 2, behavior: "smooth" });
  });
</script>

<nav class="mbar" aria-label={t("mob.bar")}>
  <div class="mb-row" bind:this={row} role="tablist">
    {#each PAGES as k (k)}
      <button type="button" role="tab" class="mb" class:on={mob.page === k} aria-selected={mob.page === k} data-pg={k} onclick={() => { mob.more = false; goPage(k); }}>
        <Icon name={icon(k)} /><span>{label(k)}</span>
      </button>
    {/each}
  </div>
  <button type="button" class="mb-tot" aria-expanded={mob.more} aria-label={t("dock.open", { total: eur(calc.T.total) })} onclick={() => (mob.more = !mob.more)}>
    <b class="num">{eur(calc.T.total)}</b><small>{t("perPerson", { v: eur(calc.T.total / Math.max(1, calc.T.active)) })}</small><span class="up" aria-hidden="true">{mob.more ? "▾" : "▴"}</span>
  </button>
</nav>

{#if mob.more}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-bg sheet-bg" onclick={e => { if (e.target === e.currentTarget) mob.more = false; }}>
    <div class="sheet-in mb-sheet" role="dialog" aria-modal="true" aria-label={t("mob.more")}>
      <button class="x sheet-x" onclick={() => (mob.more = false)} aria-label={t("close")}>✕</button>
      {#if cloud.configured && FLIGHTS_URL}<div class="mb-acts"><button type="button" class="btn mb-bug" onclick={() => { mob.more = false; bugDialog.open = true; }}>🐞 {t("bug.title")}</button></div>{/if}
      <TicketAside sheet onpick={() => (mob.more = false)} />
      <AppFooter />
    </div>
  </div>
{/if}

<style>
  .mbar { position: fixed; z-index: 92; left: 0; right: 0; bottom: 0; height: calc(var(--mob-bar) + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); display: flex; align-items: stretch; background: color-mix(in srgb, var(--paper) 94%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-top: 1px solid var(--line); }
  .mb-row { flex: 1; min-width: 0; display: flex; overflow-x: auto; scrollbar-width: none; }
  .mb-row::-webkit-scrollbar { display: none; }
  .mb { flex: none; min-width: 64px; padding: 0 6px; border: 0; background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font: 600 10.5px inherit; font-family: inherit; color: var(--ink-2); white-space: nowrap; }
  .mb :global(svg) { width: 20px; height: 20px; }
  .mb.on { color: var(--a); font-weight: 800; }
  .mb-tot { flex: none; border: 0; border-inline-start: 1px solid var(--line); background: transparent; padding: 0 12px; display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: 4px; align-content: center; text-align: end; color: var(--ink); font-family: inherit; }
  .mb-tot b { font: 800 15px "Bricolage Grotesque Variable", sans-serif; }
  .mb-tot small { grid-row: 2; font-size: 10.5px; color: var(--ink-2); white-space: nowrap; }
  .mb-tot .up { grid-row: 1 / 3; grid-column: 2; align-self: center; font-size: 11px; color: var(--ink-2); }
  .mb-acts { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 12px; }
</style>
