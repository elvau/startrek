<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import type { Snippet } from "svelte";
  import { portal } from "./portal";
  /** inline: als aufgeklappter Bereich an Ort und Stelle statt als Fenster über allem */
  let { title, onclose, children, wide = false, inline = false }: { title: string; onclose: () => void; children: Snippet; wide?: boolean; inline?: boolean } = $props();
  let box = $state<HTMLElement>();
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
    // aufgeklappt: Esc nur, wenn man gerade darin ist
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && (!inline || box?.contains(document.activeElement))) onclose(); };
    addEventListener("keydown", k);
    // aufgeklappt nur hinscrollen: ein Fokus aufs Ziel-Feld klappte dessen Liste auf (und auf dem Handy die Tastatur)
    if (inline) box?.scrollIntoView({ behavior: "smooth", block: "start" });
    else box?.querySelector<HTMLElement>("input,button")?.focus();
    return () => removeEventListener("keydown", k);
  });
</script>

{#snippet head()}
  <div class="modal-h"><h3>{title}</h3>{#if nudge}<span class="modal-hint" role="status">{t("modal.closeHint")}</span>{/if}<button class="x" onclick={onclose} aria-label={t("close")}>×</button></div>
{/snippet}
{#if inline}
  <section class="modal inline" class:wide aria-label={title} bind:this={box}>
    {@render head()}
    {@render children()}
  </section>
{:else}
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="modal-bg" use:portal onpointerdown={e => (downOnBg = e.target === e.currentTarget)} onclick={bgClick}>
  <div class="modal" class:wide class:nudge role="dialog" tabindex="-1" aria-modal="true" aria-label={title} bind:this={box}
    onclick={e => e.stopPropagation()} oninput={() => (dirty = true)} onchange={() => (dirty = true)}>
    {@render head()}
    {@render children()}
  </div>
</div>
{/if}
