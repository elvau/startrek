<script lang="ts">
  import { app, deleteTrip, duplicateTrip, newTrip, switchTrip } from "../store.svelte";
  import { monthYear } from "../format";

  let { compact = false }: { compact?: boolean } = $props();
  let open = $state(false);
  let root: HTMLDivElement;

  $effect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") open = false; };
    addEventListener("click", close, true);
    addEventListener("keydown", esc);
    return () => { removeEventListener("click", close, true); removeEventListener("keydown", esc); };
  });

  function act(fn: () => void) { fn(); open = false; }
  function remove() {
    if (confirm(`„${app.trip.name}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`)) act(() => deleteTrip(app.trip.id));
  }
</script>

<div class="tmenu" class:compact bind:this={root}>
  <button class="tm-btn" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="tm-name">{app.trip.name || "Reise"}</span><span class="tm-car" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="tm-pop" role="menu">
      <div class="tm-h">Meine Reisen</div>
      {#each app.index as m (m.id)}
        <button role="menuitemradio" aria-checked={m.id === app.trip.id} class="tm-trip" class:on={m.id === app.trip.id} onclick={() => act(() => switchTrip(m.id))}>
          <b>{m.name || "Ohne Namen"}</b><small>{[m.place, m.from ? monthYear(m.from) : ""].filter(Boolean).join(" · ")}</small>
        </button>
      {/each}
      <div class="tm-sep"></div>
      <button role="menuitem" class="tm-act" onclick={() => act(newTrip)}>+ Neue Reise</button>
      <button role="menuitem" class="tm-act" onclick={() => act(duplicateTrip)}>Diese Reise kopieren</button>
      <button role="menuitem" class="tm-act danger" onclick={remove}>Diese Reise löschen</button>
    </div>
  {/if}
</div>
