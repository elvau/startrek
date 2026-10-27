<script lang="ts">
  /*
   * Teilen direkt in „Gemeinsam planen“ (sonst nur im Reise-Menü): geteilte Reise → „Teilen und Mitglieder“ bzw.
   * „Mitglieder“; nur auf dem Gerät → erst ins Konto, dann gleich das Fenster zum Teilen; ohne Anmeldung → Anmelden.
   */
  import { t, tn } from "../i18n/index.svelte";
  import { app, moveToCloud } from "../store.svelte";
  import { cloud, cloudTrip } from "../cloud/cloud.svelte";
  import ShareDialog from "./ShareDialog.svelte";

  const cur = $derived(cloudTrip(app.trip.id));
  const isOwner = $derived(!!cur && cur.owner === cloud.user?.uid);
  const members = $derived(Object.keys(cur?.members || {}).length);
  let open = $state(false), busy = $state(false), wantOpen = $state(false);
  // nach dem Hochladen öffnen, sobald die Reise als Konto-Reise bekannt ist
  $effect(() => { if (wantOpen && cur) { wantOpen = false; open = true; } });
  async function saveAndShare() {
    busy = true;
    try { wantOpen = true; await moveToCloud(app.trip.id); } finally { busy = false; }
  }
</script>

{#if cloud.configured}
  <div class="sb">
    {#if cur}
      <span class="small muted sb-st">{members > 1 ? tn("sb.members", members) : t("sb.alone")}</span>
      <button class="btn sm primary sb-share" onclick={() => (open = true)}>🔗 {isOwner ? t("tm.shareMembers") : t("tm.members")}</button>
    {:else if cloud.user}
      <span class="small muted sb-st">{t("sb.local")}</span>
      <button class="btn sm primary sb-share" disabled={busy} onclick={saveAndShare}>🔗 {t("sb.saveShare")}</button>
    {:else}
      <span class="small muted sb-st">{t("sb.local")}</span>
      <button class="btn sm primary sb-share" onclick={() => (cloud.showLogin = true)}>🔗 {t("tm.loginShare")}</button>
    {/if}
  </div>
  {#if open}<ShareDialog id={app.trip.id} onclose={() => (open = false)} />{/if}
{/if}

<style>
  .sb { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
</style>
