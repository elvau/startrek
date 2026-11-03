<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Neue Reise: geführt mit vier Fragen (#672: Wohin, Wann, Wer, Von wo), jede überspringbar.
   * Oder per KI aus einem Angebot importieren (#457, nur mit Konto-Einrichtung).
   */
  import { cloud } from "../cloud/cloud.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import { whoMissing } from "../who";
  import Modal from "./Modal.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import { newWho, whoTravelers } from "./WhoPicker.svelte";
  import GuidedTrip from "./GuidedTrip.svelte";

  let { onclose, mode: start = "blank", shared = [], sharedText = "", sharedUrl = "" }: { onclose: () => void; mode?: "blank" | "import"; shared?: File[]; sharedText?: string; sharedUrl?: string } = $props();
  // Wer fährt mit beim Import (sonst nimmt er die Personen aus dem Angebot)
  let who = $state(newWho());
  const MODES = ["blank", "import"] as const;
  // svelte-ignore state_referenced_locally
  let mode = $state<"blank" | "import">(start);
  // gewählt, wer mitfährt: gilt auch für den Import (sonst nimmt er die Personen aus dem Angebot)
  let picked = $state(false);
  let groups = $state(false);
  // Frage der geführten neuen Reise: Leer/Importieren nur bei der ersten
  let step = $state(0);
  const missing = $derived(whoMissing(who));
</script>

{#if groups}<GroupsDialog onclose={() => (groups = false)} />{/if}
<!-- Gruppen verwalten liegt darüber; die Fragen bleiben mit ihren Antworten stehen -->
<div class="nt-wrap" hidden={groups}>
  <Modal title={t("newtrip.title")} onclose={() => { if (!groups) onclose(); }}>
    {#if cloud.configured && (mode === "import" || step === 0)}
      <div class="chips nt-mode" role="group">
        {#each MODES as m (m)}<button type="button" class="chip" class:on={mode === m} aria-pressed={mode === m} onclick={() => (mode = m)}>{t(`newtrip.mode.${m}` as Key)}</button>{/each}
      </div>
    {/if}
    {#if mode === "import" && cloud.configured}
      <ImportPanel {onclose} {shared} {sharedText} {sharedUrl} travelers={() => (picked && !missing ? whoTravelers(who) : undefined)} peopleKnown={picked && !missing} />
    {:else}
    <GuidedTrip {onclose} ongroups={() => (groups = true)} bind:step />
    {/if}
  </Modal>
</div>

<style>
  .nt-mode { margin-bottom: 12px; }
</style>
