<script lang="ts">
  import { access, allTrips, app, deleteTrip, duplicateTrip, moveToCloud, switchTrip } from "../store.svelte";
  import { cloud, cloudTrip } from "../cloud/cloud.svelte";
  import { monthYear } from "../format";
  import ShareDialog from "./ShareDialog.svelte";
  import NewTripDialog from "./NewTripDialog.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";

  let { compact = false }: { compact?: boolean } = $props();
  let open = $state(false);
  let share = $state(false);
  let creating = $state(false);
  let groups = $state(false);
  let root: HTMLDivElement;

  const trips = $derived(allTrips());
  const cur = $derived(cloudTrip(app.trip.id));
  const isOwner = $derived(!!cur && cur.owner === cloud.user?.uid);
  const R = { owner: "", editor: "plant mit", viewer: "nur ansehen" };

  $effect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") open = false; };
    addEventListener("click", close, true);
    addEventListener("keydown", esc);
    return () => { removeEventListener("click", close, true); removeEventListener("keydown", esc); };
  });

  function act(fn: () => unknown) { void fn(); open = false; }
  function remove() {
    const q = cur && !isOwner
      ? `„${app.trip.name}“ verlassen? Du siehst die Reise danach nicht mehr.`
      : `„${app.trip.name}“ wirklich löschen?${cur && Object.keys(cur.members).length > 1 ? " Sie verschwindet auch für alle Mitreisenden." : ""} Das lässt sich nicht rückgängig machen.`;
    if (confirm(q)) act(() => deleteTrip(app.trip.id));
  }
</script>

<div class="tmenu" class:compact bind:this={root}>
  <button class="tm-btn" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>
    {#if cur}<span aria-hidden="true">☁</span>{/if}<span class="tm-name">{app.trip.name || "Reise"}</span><span class="tm-car" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="tm-pop" role="menu">
      <div class="tm-h">Meine Reisen</div>
      {#each trips as m (m.id)}
        <button role="menuitemradio" aria-checked={m.id === app.trip.id} class="tm-trip" class:on={m.id === app.trip.id} onclick={() => act(() => switchTrip(m.id))}>
          <b>{m.cloud ? "☁ " : ""}{m.name || "Ohne Namen"}</b>
          <small>{[m.place, m.from ? monthYear(m.from) : "", m.role ? R[m.role] : "", m.shared ? "geteilt" : "", !m.cloud && cloud.user ? "nur auf diesem Gerät" : ""].filter(Boolean).join(" · ")}</small>
        </button>
      {/each}
      <div class="tm-sep"></div>
      <button role="menuitem" class="tm-act" onclick={() => { creating = true; open = false; }}>+ Neue Reise</button>
      <button role="menuitem" class="tm-act" onclick={() => act(duplicateTrip)}>Diese Reise kopieren</button>
      {#if cloud.user && !cur}
        <button role="menuitem" class="tm-act" onclick={() => act(() => moveToCloud(app.trip.id))}>☁ Im Konto speichern</button>
      {/if}
      {#if cur}
        <button role="menuitem" class="tm-act" onclick={() => { share = true; open = false; }}>{isOwner ? "Teilen und Mitglieder" : "Mitglieder"}</button>
      {:else if cloud.configured && !cloud.user}
        <button role="menuitem" class="tm-act" onclick={() => { cloud.showLogin = true; open = false; }}>Anmelden zum Teilen</button>
      {/if}
      <button role="menuitem" class="tm-act" onclick={() => { groups = true; open = false; }}>Gruppen und Personen</button>
      {#if !access.readonly || (cur && !isOwner)}
        <button role="menuitem" class="tm-act danger" onclick={remove}>{cur && !isOwner ? "Reise verlassen" : "Diese Reise löschen"}</button>
      {/if}
    </div>
  {/if}
</div>

{#if share}<ShareDialog id={app.trip.id} onclose={() => (share = false)} />{/if}
{#if creating}<NewTripDialog onclose={() => (creating = false)} />{/if}
{#if groups}<GroupsDialog onclose={() => (groups = false)} />{/if}
