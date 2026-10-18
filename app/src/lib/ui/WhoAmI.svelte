<script lang="ts">
  /*
   * „Wer bist du?“ (#435): nach dem Beitreten über den Einladungslink die eigene Person wählen (Platzhalter oder noch
   * nicht verknüpfte erwachsene Person). Die Zuordnung liegt im Konto der Reise; wer bearbeiten darf, trägt sie ein.
   * „Später“ merkt sich das Gerät je Reise.
   */
  import { t } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { claimTraveler, cloud, cloudTrip } from "../cloud/cloud.svelte";
  import { claimable, cleanName } from "../claims";
  import { animalEmoji } from "../placeholders";
  import Modal from "./Modal.svelte";

  let { onclose }: { onclose: () => void } = $props();
  const ct = $derived(cloudTrip(app.trip.id));
  const me = $derived(cloud.user?.uid || "");
  const list = $derived(claimable(app.trip, ct?.claims, me));
  let pick = $state("");
  let name = $state(cloud.user?.name || "");
  let busy = $state(false), err = $state("");

  async function take() {
    const n = cleanName(name);
    if (!pick || !n) return;
    busy = true; err = "";
    try { await claimTraveler(app.trip.id, { t: pick, n }); onclose(); }
    catch { err = t("who.failed"); }
    busy = false;
  }
</script>

<Modal title={t("who.title")} {onclose}>
  <div class="who">
    <p>{t("who.lead", { trip: ct?.name || app.trip.name })}</p>
    <div class="who-list" role="radiogroup" aria-label={t("who.title")}>
      {#each list as x (x.id)}
        <button type="button" class="chip who-p" class:on={pick === x.id} role="radio" aria-checked={pick === x.id} onclick={() => (pick = x.id)}>
          {animalEmoji(x.household) ?? "🙂"} {x.name}{#if x.household && !x.name.startsWith(x.household)} <small class="muted">· {x.household}</small>{/if}
        </button>
      {/each}
    </div>
    <label class="f">{t("login.firstName")}<input bind:value={name} maxlength="40" autocomplete="given-name" /></label>
    {#if err}<p class="err">{err}</p>{/if}
    <p class="fu-acts">
      <button class="btn primary who-ok" disabled={busy || !pick || !cleanName(name)} onclick={take}>{t("who.take")}</button>
      <button class="linkbtn who-skip" onclick={onclose}>{t("who.notListed")}</button>
    </p>
    <p class="muted small">{t("who.hint")}</p>
  </div>
</Modal>

<style>
  .who { display: flex; flex-direction: column; gap: 12px; }
  .who p { margin: 0; }
  .who-list { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
