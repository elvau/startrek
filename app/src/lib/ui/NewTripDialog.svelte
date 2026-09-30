<script lang="ts">
  import { t, tn, type Key } from "../i18n/index.svelte";
  /* Neue Reise: nur wer mitfährt; Ort und Zeitraum kommen später in der Reise dazu (Name bildet sich daraus) */
  import { startTrip } from "../store.svelte";
  import { dir } from "../directory.svelte";
  import { whoCount, whoGroupName, whoMissing } from "../who";
  import Modal from "./Modal.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import WhoPicker, { newWho, whoTravelers } from "./WhoPicker.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let who = $state(newWho());
  let groups = $state(false);
  const missing = $derived(whoMissing(who));
  const name = $derived(whoGroupName(who, dir));
  const label = $derived(name ? t("who.createWith", { name, p: tn("n.persons", whoCount(who)) }) : t("newtrip.create"));

  function create(e: Event) {
    e.preventDefault();
    if (missing) return;
    startTrip(whoTravelers(who));
    onclose();
  }
</script>

{#if groups}
  <GroupsDialog onclose={() => (groups = false)} />
{:else}
  <Modal title={t("newtrip.title")} {onclose}>
    <form class="newtrip" onsubmit={create}>
      <div class="ed-sec">
        <span class="dlabel">{t("newtrip.who")}</span>
        <WhoPicker bind:who />
        <button type="button" class="linkbtn" onclick={() => (groups = true)}>{t("groups.manage")}</button>
      </div>
      <div class="ed-foot"><span class="muted small">{missing ? t(missing as Key) : t("newtrip.hint")}</span><button class="btn primary" disabled={!!missing}>{label}</button></div>
    </form>
  </Modal>
{/if}
