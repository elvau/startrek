<script lang="ts">
  /* Anleitung „App installieren“ ohne Installationsfenster des Browsers: iPhone/iPad (Safari) oder Android (Chrome-Menü) */
  import { t } from "../i18n/index.svelte";
  import { install } from "../install.svelte";
  import Modal from "./Modal.svelte";
</script>

<Modal title={t("install.title")} onclose={() => (install.help = false)}>
  <ol class="install-steps">
    {#if install.ios}
      <li>{t("install.ios1")}</li>
      <li>{t("install.ios2")}</li>
    {:else}
      <li>{t("install.and1")}</li>
      <li>{t("install.and2")}</li>
    {/if}
  </ol>
  <p class="muted small">{t("install.why")}</p>
  {#if !install.ios}<p class="muted small">{t("install.andRetry")}</p>{/if}
</Modal>

<style>
  .install-steps{margin:0 0 .8em;padding-inline-start:1.3em;display:grid;gap:.4em}
</style>
