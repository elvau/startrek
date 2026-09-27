<script lang="ts">
  import { onMount } from "svelte";
  import { access, app, calc, addItem, discardDetails, resetSample, setDetailed } from "./lib/store.svelte";
  import { isDetailed } from "./lib/model";
  import SimpleCard from "./lib/ui/SimpleCard.svelte";
  import { cloud } from "./lib/cloud/cloud.svelte";
  import LoginDialog from "./lib/ui/LoginDialog.svelte";
  import { eur } from "./lib/calc";
  import { CHAPTERS, CAT_CHAPTERS, SPLIT } from "./lib/chapters";
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
  import Split from "./lib/ui/Split.svelte";

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

  const households = $derived(Object.keys(calc.T.byHousehold).length);
  const nn = $derived(nights(app.trip.from, app.trip.to));
</script>

<Sprite />
<Ambience />
<TopNav />
<Hero />

<div class="wrap">
  <main>
    <Chapter ch={CHAPTERS[0]} n={1} sum={String(calc.T.active)} sub="{calc.T.active < app.trip.travelers.length ? `von ${app.trip.travelers.length} dabei · ` : ''}{households} {households === 1 ? 'Familie' : 'Familien'}">
      <article class="card" use:reveal><TravelersCard /></article>
    </Chapter>

    {#each CAT_CHAPTERS as ch, i (ch.k)}
      {@const items = app.trip.items.filter(x => x.cat === ch.k)}
      {@const det = isDetailed(app.trip, ch.k)}
      <Chapter {ch} n={i + 2} sum={eur(calc.T.byCat[ch.k])} sub={ch.k === "stay" && nn && det ? `${nn} Nächte` : ch.sub}
        onadd={access.readonly || !det ? undefined : () => addItem(ch.k)}
        onreset={items.length ? () => { if (confirm(`Alle ${items.length} Posten bei „${ch.label}“ löschen?`)) discardDetails(ch.k); } : undefined}
        mode={det ? "detail" : "simple"} onmode={access.readonly ? undefined : on => setDetailed(ch.k, on)}>
        {#if !det}
          <SimpleCard cat={ch.k} label={ch.label} />
        {:else}
          {#if ch.k === "stay"}<article class="card plan-card" use:reveal><PresencePlan /></article>{/if}
          {#each items as item (item.id)}
            <ItemCard {item} icon={ch.icon} />
          {:else}
            <div class="empty-ch">Noch nichts eingetragen.</div>
          {/each}
        {/if}
      </Chapter>
    {/each}

    <Chapter ch={SPLIT} n={CHAPTERS.length} sum={eur(calc.T.total)} sub="{households} {households === 1 ? 'Familie' : 'Familien'}">
      <Split />
    </Chapter>
  </main>
  <TicketAside />
</div>

<p class="note">
  {cloud.user ? "Reisen mit ☁ liegen in deinem Konto." : "Gespeichert wird in diesem Browser."}
  {#if !access.readonly}<button class="linkbtn" onclick={() => { if (confirm("Beispielreise wiederherstellen? Eigene Änderungen gehen verloren.")) resetSample(); }}>Beispiel zurücksetzen</button>{/if}
</p>

<Dock />
{#if cloud.showLogin && !cloud.user}<LoginDialog />{/if}
