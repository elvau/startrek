<script lang="ts">
  import { cloud } from "../cloud/cloud.svelte";
  import { app, logout, moveAllToCloud } from "../store.svelte";

  let { compact = false }: { compact?: boolean } = $props();
  let open = $state(false);
  let busy = $state(false);
  let root = $state<HTMLDivElement>();
  const local = $derived(app.index.filter(m => !cloud.trips.some(t => t.id === m.id)).length);
  const STATUS = { local: "Nur auf diesem Gerät", saving: "Speichert…", saved: "Im Konto gespeichert", offline: "Offline, wird später gespeichert", error: "Fehler beim Speichern" };

  $effect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => { if (!root?.contains(e.target as Node)) open = false; };
    addEventListener("click", c, true);
    return () => removeEventListener("click", c, true);
  });
  async function moveAll() { busy = true; await moveAllToCloud(); busy = false; }
</script>

{#if cloud.configured}
  <div class="acct" class:compact bind:this={root}>
    {#if !cloud.user}
      <button class="tm-btn" onclick={() => (cloud.showLogin = true)} disabled={!cloud.ready}>Anmelden</button>
    {:else}
      <button class="acct-btn" onclick={() => (open = !open)} aria-expanded={open} aria-label="Konto" title={cloud.user.email}>
        <span class="av sm acct-av">{cloud.user.name[0]?.toUpperCase()}</span>
        <i class="dot {cloud.status}" aria-hidden="true"></i>
      </button>
      {#if open}
        <div class="tm-pop acct-pop" role="menu">
          <div class="acct-who"><b>{cloud.user.name}</b><small>{cloud.user.email}</small></div>
          <div class="acct-st"><i class="dot {cloud.status}"></i>{STATUS[cloud.status]}</div>
          {#if cloud.error}<div class="err small">{cloud.error}</div>{/if}
          {#if local}
            <div class="tm-sep"></div>
            <p class="muted small acct-p">{local} {local === 1 ? "Reise liegt" : "Reisen liegen"} nur auf diesem Gerät.</p>
            <button class="tm-act" onclick={moveAll} disabled={busy}>{busy ? "Wird übernommen…" : "Ins Konto übernehmen"}</button>
          {/if}
          <div class="tm-sep"></div>
          <button class="tm-act" onclick={() => { open = false; void logout(); }}>Abmelden</button>
        </div>
      {/if}
    {/if}
  </div>
{/if}
