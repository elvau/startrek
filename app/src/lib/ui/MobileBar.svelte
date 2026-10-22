<script lang="ts">
  /*
   * Handy (#530): feste Leiste unten statt der schwebenden Knöpfe: Übersicht · Planen (zuletzt offenes Kapitel) · Tage ·
   * Abrechnung · Mehr. „Mehr“ zeigt Fehler melden, die Kostenübersicht und die Fußzeile (Anleitung, Impressum …).
   */
  import { t } from "../i18n/index.svelte";
  import { barOf, goPage, mob, type BarKey, type PageKey } from "../mobile.svelte";
  import { bugDialog } from "../bugs/app.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { FLIGHTS_URL } from "../flights/app";
  import TicketAside from "./TicketAside.svelte";
  import Icon from "./Icon.svelte";
  import AppFooter from "./AppFooter.svelte";

  const ITEMS: { k: BarKey | "more"; icon: string; label: string; page?: () => PageKey }[] = [
    { k: "home", icon: "home", label: "mob.home", page: () => "hero" },
    { k: "plan", icon: "bag", label: "mob.plan", page: () => mob.lastPlan },
    { k: "days", icon: "calendar", label: "mob.days", page: () => "plan" },
    { k: "split", icon: "wallet", label: "mob.split", page: () => "split" },
    { k: "more", icon: "more", label: "mob.more" }
  ];
  const cur = $derived(barOf(mob.page));
  function pick(it: (typeof ITEMS)[number]) {
    if (it.page) { mob.more = false; goPage(it.page()); } else mob.more = !mob.more;
  }
</script>

<nav class="mbar" aria-label={t("mob.bar")}>
  {#each ITEMS as it (it.k)}
    <button type="button" class="mb" class:on={it.k === "more" ? mob.more : !mob.more && cur === it.k} data-mb={it.k} aria-expanded={it.k === "more" ? mob.more : undefined} onclick={() => pick(it)}>
      {#if it.k === "more"}<span class="dots" aria-hidden="true">⋯</span>{:else}<Icon name={it.icon} />{/if}<span>{t(it.label as "mob.home")}</span>
    </button>
  {/each}
</nav>

{#if mob.more}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-bg sheet-bg" onclick={e => { if (e.target === e.currentTarget) mob.more = false; }}>
    <div class="sheet-in mb-sheet" role="dialog" aria-modal="true" aria-label={t("mob.more")}>
      <button class="x sheet-x" onclick={() => (mob.more = false)} aria-label={t("close")}>✕</button>
      <div class="mb-acts">
        {#if cloud.configured && FLIGHTS_URL}<button type="button" class="btn mb-bug" onclick={() => { mob.more = false; bugDialog.open = true; }}>🐞 {t("bug.title")}</button>{/if}
      </div>
      <TicketAside sheet onpick={() => (mob.more = false)} />
      <AppFooter />
    </div>
  </div>
{/if}

<style>
  .mbar { position: fixed; z-index: 92; left: 0; right: 0; bottom: 0; height: calc(var(--mob-bar) + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); display: flex; background: color-mix(in srgb, var(--paper) 94%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-top: 1px solid var(--line); }
  .mb { flex: 1; border: 0; background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font: 600 10.5px inherit; font-family: inherit; color: var(--ink-2); }
  .mb :global(svg) { width: 21px; height: 21px; }
  .mb .dots { font-size: 20px; line-height: 21px; }
  .mb.on { color: var(--a); font-weight: 800; }
  .mb-acts { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 12px; }
  .mb-acts .btn { text-decoration: none; }
</style>
