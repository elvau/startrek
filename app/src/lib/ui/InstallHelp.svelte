<script lang="ts">
  /* Anleitung „App installieren“ für iPhone und iPad (Safari hat kein Installationsfenster) */
  import { t } from "../i18n/index.svelte";
  import { install } from "../install.svelte";
  import Modal from "./Modal.svelte";
</script>

<Modal title={t("install.title")} onclose={() => (install.help = false)}>
  <ol class="install-steps">
    <li>{t("install.ios1")}</li>
    <li>{t("install.ios2")}</li>
  </ol>
  <p class="muted small">{t("install.why")}</p>
</Modal>

<style>
  .install-steps{margin:0 0 .8em;padding-inline-start:1.3em;display:grid;gap:.4em}
</style>
