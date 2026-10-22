<script lang="ts">
  /* Handy (#530): Reiter der Seiten oben, aktive Seite in der Mitte; rechts die Gesamtkosten der Reise */
  import { t } from "../i18n/index.svelte";
  import { calc } from "../store.svelte";
  import { eur } from "../calc";
  import { CHAPTERS } from "../chapters";
  import { goPage, mob, PAGES } from "../mobile.svelte";
  import Icon from "./Icon.svelte";

  let bar = $state<HTMLElement>();
  const label = (k: string) => (k === "hero" ? t("mob.home") : CHAPTERS.find(c => c.k === k)?.label || k);
  const icon = (k: string) => (k === "hero" ? "home" : CHAPTERS.find(c => c.k === k)?.icon || "");
  // aktiven Reiter sichtbar halten (nur die Leiste verschieben, nicht die Seite)
  $effect(() => {
    const a = bar?.querySelector<HTMLElement>(`[data-pg="${mob.page}"]`);
    if (bar && a) bar.scrollTo({ left: a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2, behavior: "smooth" });
  });
</script>

<div class="mtabs">
  <div class="mt-row" bind:this={bar} role="tablist" aria-label={t("nav.chapters")}>
    {#each PAGES as k (k)}
      <button type="button" role="tab" class="mt" class:on={mob.page === k} aria-selected={mob.page === k} data-pg={k} onclick={() => goPage(k)}>{#if icon(k)}<Icon name={icon(k)} />{/if}{label(k)}</button>
    {/each}
  </div>
  <div class="mt-tot"><b class="num">{eur(calc.T.total)}</b><small>{t("perPerson", { v: eur(calc.T.total / Math.max(1, calc.T.active)) })}</small></div>
  <div class="mt-dots" aria-hidden="true">{#each PAGES as k (k)}<i class:on={mob.page === k}></i>{/each}</div>
</div>

<style>
  .mtabs { position: fixed; z-index: 90; left: 0; right: 0; top: var(--mob-top); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 10px 4px; background: color-mix(in srgb, var(--paper) 92%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); }
  .mt-row { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .mt-row::-webkit-scrollbar { display: none; }
  .mt { flex: none; display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 999px; padding: 6px 11px; font: 600 13px inherit; font-family: inherit; color: var(--ink-2); background: var(--paper-2); }
  .mt :global(svg) { width: 15px; height: 15px; }
  .mt.on { background: var(--a); color: var(--paper); }
  .mt-tot { text-align: end; line-height: 1.1; }
  .mt-tot b { display: block; font: 800 15px "Bricolage Grotesque Variable", sans-serif; }
  .mt-tot small { font-size: 10.5px; color: var(--ink-2); white-space: nowrap; }
  .mt-dots { grid-column: 1 / 3; display: flex; justify-content: center; gap: 4px; padding-top: 2px; }
  .mt-dots i { width: 5px; height: 5px; border-radius: 3px; background: var(--line); transition: width .25s, background .25s; }
  .mt-dots i.on { width: 14px; background: var(--a); }
</style>
