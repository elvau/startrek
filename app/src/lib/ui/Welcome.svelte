<script lang="ts">
  /* Erster Besuch: frisch anfangen, Beispiel ansehen oder anmelden */
  import { app, openSample } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import Modal from "./Modal.svelte";
  import NewTripDialog from "./NewTripDialog.svelte";

  let creating = $state(false);
  const close = () => (app.welcome = false);
</script>

{#if creating}
  <NewTripDialog onclose={() => { creating = false; close(); }} />
{:else}
  <Modal title="Willkommen bei der Reisekasse" onclose={close}>
    <p class="muted">Plane, was eine Reise kostet und wer wie viel zahlt. Womit möchtest du anfangen?</p>
    <div class="welcome">
      <button class="btn primary" onclick={() => (creating = true)}>Eigene Reise anlegen<small>Ziel, Zeitraum und wer mitfährt</small></button>
      <button class="btn" onclick={() => { openSample(); close(); }}>Beispielreise ansehen<small>Familie Klein in Kroatien, mit allen Funktionen</small></button>
      {#if cloud.configured}
        <button class="linkbtn" onclick={() => { cloud.showLogin = true; close(); }}>Ich habe schon ein Konto: anmelden</button>
      {/if}
    </div>
  </Modal>
{/if}
