<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import type { Snippet } from "svelte";
  import { portal } from "./portal";
  let { title, onclose, children, wide = false }: { title: string; onclose: () => void; children: Snippet; wide?: boolean } = $props();
  let box: HTMLDivElement;
  // Danebenklicken schließt nur, wenn der Klick auf dem Hintergrund begann (nicht beim Markieren und Rausziehen)
  // und noch nichts eingegeben wurde; sonst kurz wackeln und den Weg zum Schließen zeigen
  let downOnBg = false, dirty = false;
  let nudge = $state(false);
  let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  function bgClick(e: MouseEvent) {
    if (!downOnBg || e.target !== e.currentTarget) return;
    if (!dirty) { onclose(); return; }
    nudge = false;
    requestAnimationFrame(() => (nudge = true));
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => (nudge = false), 2500);
  }
  $effect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onclose(); };
    addEventListener("keydown", k);
    box?.querySelector<HTMLElement>("input,button")?.focus();
    return () => removeEventListener("keydown", k);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="modal-bg" use:portal onpointerdown={e => (downOnBg = e.target === e.currentTarget)} onclick={bgClick}>
  <div class="modal" class:wide class:nudge role="dialog" tabindex="-1" aria-modal="true" aria-label={title} bind:this={box}
    onclick={e => e.stopPropagation()} oninput={() => (dirty = true)} onchange={() => (dirty = true)}>
    <div class="modal-h"><h3>{title}</h3>{#if nudge}<span class="modal-hint" role="status">{t("modal.closeHint")}</span>{/if}<button class="x" onclick={onclose} aria-label={t("close")}>×</button></div>
    {@render children()}
  </div>
</div>
