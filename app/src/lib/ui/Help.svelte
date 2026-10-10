<script lang="ts">
  /*
   * „?“-Hinweis an schwierigen Stellen (#198): Antippen zeigt ein, zwei Sätze Erklärung (help.<k>), noch einmal,
   * außerhalb oder Escape schließt. Klicks gehen nicht an Karten oder Aufklapper darunter weiter.
   */
  import { t, type Key } from "../i18n/index.svelte";
  import { portal } from "./portal";

  let { k }: { k: string } = $props();
  let open = $state(false);
  let btn = $state<HTMLButtonElement>();
  let pos = $state({ top: 0, left: 0, width: 280 });
  const id = `help-${Math.random().toString(36).slice(2, 8)}`;

  function toggle(e: Event) {
    e.stopPropagation();
    e.preventDefault();
    open = !open;
    place();
  }
  /** feste Lage am Knopf, im Bildschirm gehalten (Handy, rechts nach links); folgt beim Scrollen */
  function place() {
    if (!open || !btn) return;
    const r = btn.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 24);
    pos = { top: r.bottom + 6, left: Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12)), width: w };
  }
  function outside(e: Event) {
    if (open && !(e.target as HTMLElement).closest?.(`#${id}, .help-q[aria-controls="${id}"]`)) open = false;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={e => { if (e.key === "Escape") open = false; }} onscroll={place} onresize={place} />

<button bind:this={btn} type="button" class="help-q" aria-label={t("help.open")} aria-expanded={open} aria-controls={id} onclick={toggle}>?</button>
{#if open}
  <span {id} class="help-pop" role="note" use:portal style:top="{pos.top}px" style:left="{pos.left}px" style:width="{pos.width}px">{t(`help.${k}` as Key)}</span>
{/if}

<style>
  .help-q { all: unset; box-sizing: border-box; display: inline-grid; place-items: center; width: 18px; height: 18px; margin-inline: 4px; border-radius: 50%;
    border: 1px solid var(--line); background: var(--paper); color: var(--ink-2); font: 700 11px/1 "Figtree Variable", sans-serif; cursor: pointer; vertical-align: middle; flex: none; }
  .help-q:hover, .help-q[aria-expanded="true"] { color: var(--paper); background: var(--ink-2); border-color: var(--ink-2); }
  .help-q:focus-visible { outline: 2px solid var(--a); outline-offset: 1px; }
  .help-pop { position: fixed; z-index: 90; box-sizing: border-box; padding: 10px 12px; border-radius: 12px; background: var(--ink); color: var(--paper);
    font: 400 13px/1.45 "Figtree Variable", sans-serif; letter-spacing: 0; text-transform: none; text-align: start; white-space: normal; box-shadow: var(--shadow); }
</style>
