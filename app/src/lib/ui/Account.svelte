<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import type { Key } from "../i18n/index.svelte";
  import { localTrips, logout, moveAllToCloud } from "../store.svelte";
  import { admin, checkAdmin } from "../admin/app.svelte";
  import { connect } from "../connector/app.svelte";

  let { compact = false }: { compact?: boolean } = $props();
  let open = $state(false);
  let busy = $state(false);
  let root = $state<HTMLDivElement>();
  const local = $derived(localTrips().length);
  const STATUS = (s: string) => t(`acct.st.${s}` as Key);

  $effect(() => {
    if (!open) return;
    if (cloud.user) void checkAdmin(cloud.user.uid);
    const c = (e: MouseEvent) => { if (!root?.contains(e.target as Node)) open = false; };
    addEventListener("click", c, true);
    return () => removeEventListener("click", c, true);
  });
  // abgemeldet: Admin-Freigabe bei der nächsten Anmeldung neu prüfen
  $effect(() => { if (!cloud.user) { admin.uid = ""; admin.is = false; admin.open = false; } });
  async function moveAll() { busy = true; await moveAllToCloud(); busy = false; }
</script>

{#if cloud.configured}
  <div class="acct" class:compact bind:this={root}>
    {#if !cloud.user}
      <button class="tm-btn" onclick={() => (cloud.showLogin = true)} disabled={!cloud.ready}>{t("acct.login")}</button>
    {:else}
      <button class="acct-btn" onclick={() => (open = !open)} aria-expanded={open} aria-label={t("acct.account")} title={cloud.user.email}>
        <span class="av sm acct-av">{cloud.user.name[0]?.toUpperCase()}</span>
        <i class="dot {cloud.status}" aria-hidden="true"></i>
      </button>
      {#if open}
        <div class="tm-pop acct-pop" role="menu">
          <div class="acct-who"><b>{cloud.user.name}</b><small>{cloud.user.email}</small></div>
          <div class="acct-st"><i class="dot {cloud.status}"></i>{STATUS(cloud.status)}</div>
          {#if cloud.error}<div class="err small">{cloud.error}</div>{/if}
          {#if local}
            <div class="tm-sep"></div>
            <p class="muted small acct-p">{tn("acct.localTrips", local)}</p>
            <button class="tm-act" onclick={moveAll} disabled={busy}>{busy ? t("acct.moving") : t("acct.moveAll")}</button>
          {/if}
          <div class="tm-sep"></div>
          <button class="tm-act acct-claude" onclick={() => { open = false; connect.open = true; }}>{t("mcp.open")}</button>
          {#if admin.is && admin.uid === cloud.user.uid}
            <div class="tm-sep"></div>
            <button class="tm-act acct-usage" onclick={() => { open = false; admin.open = true; }}>{t("adm.open")}</button>
          {/if}
          <div class="tm-sep"></div>
          <button class="tm-act" onclick={() => { open = false; void logout(); }}>{t("acct.logout")}</button>
        </div>
      {/if}
    {/if}
  </div>
{/if}
