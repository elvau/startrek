<script lang="ts">
  /* Menüleiste: Bubble „Wichtiges“ mit rotem Zähler der offenen Punkte; Tipp öffnet das Popup mit allen Punkten */
  import { t, tn } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { imp, loadImportant } from "../importantState.svelte";
  import Modal from "./Modal.svelte";
  import Important from "./Important.svelte";
  $effect(() => { void app.trip.id; loadImportant(); });
  const n = $derived(imp.open.length);
  const show = $derived(imp.points.length > 0 || imp.countries.length > 0);
</script>

{#if show}
  <button class="icon-btn imp-btn" class:hot={n > 0} onclick={() => (imp.shown = true)} aria-label={n ? `${t("imp.title")}: ${tn("imp.openN", n)}` : t("imp.title")} title={t("imp.title")}>
    <span aria-hidden="true">❗</span>{#if n}<span class="imp-badge">{n}</span>{/if}
  </button>
{/if}
{#if imp.shown}<Modal title="❗ {t('imp.title')}" wide onclose={() => (imp.shown = false)}><Important /></Modal>{/if}

<style>
  .imp-btn { position: relative; font-size: 16px; }
  .imp-badge { position: absolute; top: -4px; inset-inline-end: -4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #d0342c; color: #fff; font-weight: 800; font-size: 11.5px; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px var(--paper, #fff); }
  .imp-btn.hot { animation: imp-pulse 2.4s ease-in-out 2; }
  @keyframes imp-pulse { 50% { transform: scale(1.12); } }
  @media (prefers-reduced-motion: reduce) { .imp-btn.hot { animation: none; } }
</style>
