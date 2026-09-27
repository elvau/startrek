<script lang="ts">
  import { onMount } from "svelte";
  import { app, calc, addItem, resetSample } from "./lib/store.svelte";
  import { eur } from "./lib/calc";
  import { CHAPTERS, CAT_CHAPTERS } from "./lib/chapters";
  import { initScroll } from "./lib/scroll.svelte";
  import { nights } from "./lib/format";
  import Sprite from "./lib/ui/Sprite.svelte";
  import Ambience from "./lib/ui/Ambience.svelte";
  import TopNav from "./lib/ui/TopNav.svelte";
  import Hero from "./lib/ui/Hero.svelte";
  import Chapter from "./lib/ui/Chapter.svelte";
  import TravelersCard from "./lib/ui/TravelersCard.svelte";
  import ItemCard from "./lib/ui/ItemCard.svelte";
  import TicketAside from "./lib/ui/TicketAside.svelte";
  import Dock from "./lib/ui/Dock.svelte";
  import { reveal } from "./lib/ui/reveal";
  import PresencePlan from "./lib/ui/PresencePlan.svelte";

  onMount(() => {
    try { const t = localStorage.getItem("rk-theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
    const off = initScroll();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") app.editing = null; };
    const outside = (e: MouseEvent) => { if (app.editing && !(e.target as HTMLElement).closest(".card, .add")) app.editing = null; };
    addEventListener("keydown", esc);
    addEventListener("click", outside);
    return () => { off(); removeEventListener("keydown", esc); removeEventListener("click", outside); };
  });

  $effect(() => { document.body.classList.toggle("editing", !!app.editing); });

  const households = $derived(new Set(app.trip.travelers.map(t => t.household.trim() || "Ohne Haushalt")).size);
  const nn = $derived(nights(app.trip.from, app.trip.to));
</script>

<Sprite />
<Ambience />
<TopNav />
<Hero />

<div class="wrap">
  <main>
    <Chapter ch={CHAPTERS[0]} n={1} sum={String(app.trip.travelers.length)} sub="{households} {households === 1 ? 'Haushalt' : 'Haushalte'}">
      <article class="card" use:reveal><TravelersCard /></article>
    </Chapter>

    {#each CAT_CHAPTERS as ch, i (ch.k)}
      {@const items = app.trip.items.filter(x => x.cat === ch.k)}
      <Chapter {ch} n={i + 2} sum={eur(calc.T.byCat[ch.k])} sub={ch.k === "stay" && nn ? `${nn} Nächte` : ch.sub} onadd={() => addItem(ch.k)}>
        {#if ch.k === "stay"}<article class="card plan-card" use:reveal><PresencePlan /></article>{/if}
        {#each items as item (item.id)}
          <ItemCard {item} icon={ch.icon} />
        {:else}
          <div class="empty-ch">Noch nichts eingetragen.</div>
        {/each}
      </Chapter>
    {/each}
  </main>
  <TicketAside />
</div>

<p class="note">
  Neue Reisekasse, Vorschau. Gespeichert wird in diesem Browser.
  <button class="linkbtn" onclick={() => { if (confirm("Beispielreise wiederherstellen? Eigene Änderungen gehen verloren.")) resetSample(); }}>Beispiel zurücksetzen</button>
</p>

<Dock />
