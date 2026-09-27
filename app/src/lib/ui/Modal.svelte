<script lang="ts">
  import type { Snippet } from "svelte";
  import { portal } from "./portal";
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();
  let box: HTMLDivElement;
  $effect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onclose(); };
    addEventListener("keydown", k);
    box?.querySelector<HTMLElement>("input,button")?.focus();
    return () => removeEventListener("keydown", k);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="modal-bg" use:portal onclick={onclose}>
  <div class="modal" role="dialog" tabindex="-1" aria-modal="true" aria-label={title} bind:this={box} onclick={e => e.stopPropagation()}>
    <div class="modal-h"><h3>{title}</h3><button class="x" onclick={onclose} aria-label="Schließen">×</button></div>
    {@render children()}
  </div>
</div>
