<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /*
   * Realitätscheck (#461): von der Startseite ohne Reise (Angebot einwerfen, Bericht an einem Entwurf, erst „Als Reise
   * übernehmen“ legt sie an) oder für die offene Reise aus dem Reise-Menü (nur Bericht).
   */
  import type { Trip } from "../model";
  import Modal from "./Modal.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import RealityReport from "./RealityReport.svelte";

  let { onclose, trip }: { onclose: () => void; trip?: Trip } = $props();
</script>

<Modal title={t("real.title")} {onclose}>
  {#if trip}<RealityReport {trip} />{:else}<ImportPanel {onclose} check />{/if}
</Modal>
