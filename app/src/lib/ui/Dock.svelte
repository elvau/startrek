<script lang="ts">
  import { app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { CHAPTERS } from "../chapters";
  import { view } from "../scroll.svelte";
  import Icon from "./Icon.svelte";

  const ch = $derived(CHAPTERS.find(c => c.k === view.active) || CHAPTERS[0]);
  const val = $derived(ch.k === "trav" ? `${app.trip.travelers.length} Personen` : eur(calc.T.byCat[ch.k]));
</script>

<div class="dock" aria-hidden="true">
  <span class="ic"><Icon name={ch.icon} /></span>
  <div><small>{ch.label}</small><b class="num">{val}</b></div>
  <div class="tot"><small>Gesamt</small><b class="num">{eur(calc.T.total)}</b></div>
</div>
