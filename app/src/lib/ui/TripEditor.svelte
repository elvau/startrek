<script lang="ts">
  import { app } from "../store.svelte";
  import { autoName, nights } from "../format";

  let { onclose }: { onclose: () => void } = $props();
  const trip = $derived(app.trip);
  const nn = $derived(nights(trip.from, trip.to));
</script>

<div class="trip-ed">
  <div class="ed-row">
    <label class="f grow">Name der Reise
      <!-- leer lassen: Name kommt aus Ort und Zeitraum -->
      <input value={trip.autoName ? "" : trip.name} placeholder={trip.autoName ? trip.name : "z. B. Sommer in Kroatien"}
        oninput={e => { const v = e.currentTarget.value; if (v.trim()) { trip.name = v; trip.autoName = false; } else { trip.autoName = true; trip.name = autoName(trip) || trip.name; } }} /></label>
  </div>
  <div class="ed-row">
    <label class="f grow">Ort<input bind:value={trip.place} placeholder="z. B. Makarska" /></label>
    <label class="f grow">Land<input bind:value={trip.country} placeholder="z. B. Kroatien" /></label>
  </div>
  <div class="ed-row">
    <label class="f">Von<input type="date" bind:value={trip.from} /></label>
    <label class="f">Bis<input type="date" bind:value={trip.to} min={trip.from} /></label>
    {#if nn}<span class="muted ed-note">{nn} Nächte</span>{/if}
  </div>
  <div class="ed-row">
    <label class="f grow">Zeile über dem Titel<input bind:value={trip.kicker} placeholder="z. B. Sommerferien 2027 · Familie Klein" /></label>
  </div>
  <div class="ed-foot"><span class="muted">Wird automatisch gespeichert.</span><button class="btn primary" onclick={onclose}>Fertig</button></div>
</div>
