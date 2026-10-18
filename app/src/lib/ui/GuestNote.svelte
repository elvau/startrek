<script lang="ts">
  /* Gast ohne Konto (#435): kleiner Hinweis, ein Konto anzulegen; wegklickbar (je Gerät gemerkt) */
  import { t } from "../i18n/index.svelte";
  import { cloud } from "../cloud/cloud.svelte";

  const KEY = "rk2-guest-note";
  let hidden = $state((() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })());
  function hide() { hidden = true; try { localStorage.setItem(KEY, "1"); } catch {} }
</script>

{#if cloud.user?.guest && !hidden && !cloud.showLogin}
  <div class="guest-note" role="status">
    <span>👋 {t("guest.note", { name: cloud.user.name })}</span>
    <button class="btn sm primary guest-up" onclick={() => (cloud.showLogin = true)}>{t("guest.create")}</button>
    <button class="x" aria-label={t("close")} title={t("close")} onclick={hide}>×</button>
  </div>
{/if}

<style>
  /* unten in der Mitte, über den Knöpfen für KI und Fehlermeldung */
  .guest-note { position: fixed; z-index: 30; left: 50%; transform: translateX(-50%); bottom: calc(76px + env(safe-area-inset-bottom, 0px));
    width: min(560px, calc(100vw - 24px)); display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 8px 12px; box-shadow: var(--shadow); font-size: 13.5px; }
  .guest-note span { flex: 1; min-width: 200px; }
  .guest-note .x { border: 0; background: none; font-size: 18px; color: var(--ink-3); cursor: pointer; }
</style>
