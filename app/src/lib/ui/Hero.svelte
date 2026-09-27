<script lang="ts">
  import { onMount } from "svelte";
  import { app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { nights, range } from "../format";
  import TripMenu from "./TripMenu.svelte";
  import TripEditor from "./TripEditor.svelte";

  let editing = $state(false);

  const trip = $derived(app.trip);
  let shown = $state(0);
  let counting = $state(true);

  // Summe beim Start hochzählen, danach direkt folgen
  onMount(() => {
    const t0 = performance.now(), target = calc.T.total;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1400);
      shown = target * (1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step); else counting = false;
    };
    requestAnimationFrame(step);
  });
  const value = $derived(counting ? shown : calc.T.total);
  const n = $derived(trip.travelers.length);
</script>

<section class="hero" id="hero" data-ch="hero">
  <div class="hero-bar"><TripMenu /><button class="hero-edit" onclick={() => (editing = !editing)} aria-expanded={editing}>{editing ? "Schließen" : "Reise bearbeiten"}</button></div>
  <div class="hero-in">
    {#if editing}
      <TripEditor onclose={() => (editing = false)} />
    {:else}
      {#if trip.kicker}<span class="kick">☀️ {trip.kicker}</span>{/if}
      <h1>{trip.place || trip.name}{#if trip.country},<br />{trip.country}{/if}</h1>
      <div class="meta">{[range(trip.from, trip.to), nights(trip.from, trip.to) ? `${nights(trip.from, trip.to)} Nächte` : "", `${n} Reisende`].filter(Boolean).join(" · ")}</div>
    {/if}
    <div class="total">
      <b class="num">{eur(value)}</b>
      <span>{eur(n ? calc.T.total / n : 0)} pro Person · davon {eur(calc.T.fixed)} fest</span>
    </div>
  </div>
  <div class="hint"><i></i>Reise entdecken</div>
</section>
