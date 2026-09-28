<script lang="ts">
  /* Neue Reise: Ziel, Zeitraum und wer mitfährt */
  import { newTrip } from "../store.svelte";
  import Modal from "./Modal.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import { autoName, nights } from "../format";
  import WhoPicker, { whoTravelers, type WhoMode } from "./WhoPicker.svelte";
  import type { FamilyRow } from "../placeholders";

  let { onclose }: { onclose: () => void } = $props();
  let name = $state("");
  let place = $state("");
  let from = $state("");
  let to = $state("");
  const auto = $derived(autoName({ place, from, to }));
  const nn = $derived(nights(from, to));
  let mode = $state<WhoMode>("solo");
  let fams = $state<FamilyRow[]>([{ animal: "Reh", adults: 2, kids: 0, infants: 0 }]);
  let picked = $state<string[]>([]);
  let groups = $state(false);

  function create(e: Event) {
    e.preventDefault();
    newTrip({ name, place, from, to, travelers: whoTravelers(mode, fams, picked) });
    onclose();
  }
</script>

{#if groups}
  <GroupsDialog onclose={() => (groups = false)} />
{:else}
  <Modal title="Neue Reise" {onclose}>
    <form class="newtrip" onsubmit={create}>
      <div class="ed-row">
        <label class="f grow">Wohin?<input bind:value={place} placeholder="z. B. Mosel" /></label>
      </div>
      <div class="ed-row">
        <label class="f">Von<input type="date" bind:value={from} /></label>
        <label class="f">Bis<input type="date" bind:value={to} min={from} /></label>
        {#if nn}<span class="muted ed-note">{nn + 1} Tage</span>{/if}
      </div>
      <label class="f">Name (optional)<input bind:value={name} placeholder={auto || "wird aus Ziel und Zeitraum gebildet"} /></label>
      <div class="ed-sec">
        <span class="dlabel">Wer fährt mit?</span>
        <WhoPicker bind:mode bind:fams bind:picked />
        <button type="button" class="linkbtn" onclick={() => (groups = true)}>Gruppen und Personen verwalten</button>
      </div>
      <div class="ed-foot"><span class="muted small">Startet im einfachen Modus: ein Betrag je Bereich.</span><button class="btn primary">Reise anlegen</button></div>
    </form>
  </Modal>
{/if}
