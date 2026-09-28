<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /* Erster Besuch: solo oder im Rudel loslegen, Beispiel ansehen oder anmelden */
  import { app, openSample, startWith } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import Modal from "./Modal.svelte";
  import WhoPicker, { newWho, whoName, whoTravelers } from "./WhoPicker.svelte";

  let who = $state(newWho());
  const close = () => (app.welcome = false);
  // die Startreise bekommt die gewählten Reisenden; Ziel und Zeitraum trägt man später in der Reise ein
  function start() {
    startWith(whoTravelers(who), whoName(who));
    close();
  }
</script>

<Modal title={t("welcome.title")} onclose={close}>
  <p class="muted">{t("welcome.lead")}</p>
  <div class="welcome">
    <WhoPicker bind:who />
    <button class="btn primary go" onclick={start}>{t("welcome.go")}</button>
    <div class="welcome-more">
      <button class="linkbtn" onclick={() => { openSample(); close(); }}>{t("sample.open")}</button>
      {#if cloud.configured}
        <button class="linkbtn" onclick={() => { cloud.showLogin = true; close(); }}>{t("welcome.haveAccount")}</button>
      {/if}
    </div>
  </div>
</Modal>
