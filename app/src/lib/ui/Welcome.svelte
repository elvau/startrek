<script lang="ts">
  /* Erster Besuch: solo oder im Rudel loslegen, Beispiel ansehen oder anmelden */
  import { app, openSample } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import Modal from "./Modal.svelte";
  import WhoPicker, { whoTravelers, type WhoMode } from "./WhoPicker.svelte";
  import type { FamilyRow } from "../placeholders";

  let mode = $state<WhoMode>("solo");
  let fams = $state<FamilyRow[]>([{ animal: "Reh", adults: 2, kids: 0, infants: 0 }]);
  let picked = $state<string[]>([]);
  const close = () => (app.welcome = false);
  // die Startreise bekommt die gewählten Reisenden; Ziel und Zeitraum trägt man später in der Reise ein
  function start() {
    app.trip.travelers = whoTravelers(mode, fams, picked);
    close();
  }
</script>

<Modal title="Willkommen bei der Reisekasse" onclose={close}>
  <p class="muted">Plane, was eine Reise kostet und wer wie viel zahlt. Wie reist du?</p>
  <div class="welcome">
    <WhoPicker bind:mode bind:fams bind:picked />
    <button class="btn primary go" onclick={start}>Los geht's</button>
    <div class="welcome-more">
      <button class="linkbtn" onclick={() => { openSample(); close(); }}>Beispielreise ansehen</button>
      {#if cloud.configured}
        <button class="linkbtn" onclick={() => { cloud.showLogin = true; close(); }}>Ich habe schon ein Konto</button>
      {/if}
    </div>
  </div>
</Modal>
