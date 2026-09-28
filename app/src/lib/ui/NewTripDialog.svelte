<script lang="ts">
  /* Neue Reise: nur wer mitfährt; Ort und Zeitraum kommen später in der Reise dazu (Name bildet sich daraus) */
  import { newTrip } from "../store.svelte";
  import Modal from "./Modal.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import WhoPicker, { newWho, whoTravelers } from "./WhoPicker.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let who = $state(newWho());
  let groups = $state(false);

  function create(e: Event) {
    e.preventDefault();
    newTrip({ travelers: whoTravelers(who) });
    onclose();
  }
</script>

{#if groups}
  <GroupsDialog onclose={() => (groups = false)} />
{:else}
  <Modal title="Neue Reise" {onclose}>
    <form class="newtrip" onsubmit={create}>
      <div class="ed-sec">
        <span class="dlabel">Wer fährt mit?</span>
        <WhoPicker bind:who />
        <button type="button" class="linkbtn" onclick={() => (groups = true)}>Gruppen und Personen verwalten</button>
      </div>
      <div class="ed-foot"><span class="muted small">Ort und Zeitraum trägst du danach oben in der Reise ein.</span><button class="btn primary">Reise anlegen</button></div>
    </form>
  </Modal>
{/if}
