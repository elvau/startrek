<script lang="ts">
  import { t, tn, type Key } from "../i18n/index.svelte";
  /*
   * Neue Reise: nur wer mitfährt; Ort und Zeitraum kommen später in der Reise dazu (Name bildet sich daraus).
   * Oder per KI aus einem Angebot importieren (#457, nur mit Konto-Einrichtung).
   */
  import { startTrip } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import { dir } from "../directory.svelte";
  import { whoCount, whoGroupName, whoMissing, whoTripName } from "../who";
  import { animalEmoji, animalName } from "../placeholders";
  import Modal from "./Modal.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import WhoPicker, { newWho, whoTravelers } from "./WhoPicker.svelte";

  let { onclose, mode: start = "blank", shared = [], sharedText = "", sharedUrl = "" }: { onclose: () => void; mode?: "blank" | "import"; shared?: File[]; sharedText?: string; sharedUrl?: string } = $props();
  let who = $state(newWho());
  const MODES = ["blank", "import"] as const;
  // svelte-ignore state_referenced_locally
  let mode = $state<"blank" | "import">(start);
  // gewählt, wer mitfährt: gilt auch für den Import (sonst nimmt er die Personen aus dem Angebot)
  let picked = $state(false);
  let groups = $state(false);
  const missing = $derived(whoMissing(who));
  const name = $derived(whoGroupName(who, dir));
  const label = $derived(name ? t("who.createWith", { name, p: tn("n.persons", whoCount(who)) }) : t("newtrip.create"));

  function create(e: Event) {
    e.preventDefault();
    if (missing) return;
    startTrip(whoTravelers(who), whoTripName(who, m => t("who.nameGroup", { a: `${animalEmoji(m)} ${animalName(m)}` })));
    onclose();
  }
</script>

{#if groups}
  <GroupsDialog onclose={() => (groups = false)} />
{:else}
  <Modal title={t("newtrip.title")} {onclose}>
    {#if cloud.configured}
      <div class="chips nt-mode" role="group">
        {#each MODES as m (m)}<button type="button" class="chip" class:on={mode === m} aria-pressed={mode === m} onclick={() => (mode = m)}>{t(`newtrip.mode.${m}` as Key)}</button>{/each}
      </div>
    {/if}
    {#if mode === "import" && cloud.configured}
      <ImportPanel {onclose} {shared} {sharedText} {sharedUrl} travelers={() => (picked && !missing ? whoTravelers(who) : undefined)} peopleKnown={picked && !missing} />
    {:else}
    <form class="newtrip" onsubmit={create}>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="ed-sec" role="group" onpointerdown={() => (picked = true)} onkeydown={() => (picked = true)}>
        <span class="dlabel">{t("newtrip.who")}</span>
        <WhoPicker bind:who />
        <button type="button" class="linkbtn" onclick={() => (groups = true)}>{t("groups.manage")}</button>
      </div>
      <div class="ed-foot"><span class="muted small">{missing ? t(missing as Key) : t("newtrip.hint")}</span><button class="btn primary" disabled={!!missing}>{label}</button></div>
    </form>
    {/if}
  </Modal>
{/if}

<style>
  .nt-mode { margin-bottom: 12px; }
</style>
