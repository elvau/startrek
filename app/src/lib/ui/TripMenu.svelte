<script lang="ts">
  /* Oben links: „Reisen“ öffnet die Übersicht aller Reisen, „+“ legt eine neue an */
  import { access, allTrips, app, deleteTrip, duplicateTrip, moveToCloud, switchTrip } from "../store.svelte";
  import { cloud, cloudTrip } from "../cloud/cloud.svelte";
  import { monthYear, nights } from "../format";
  import Modal from "./Modal.svelte";
  import ShareDialog from "./ShareDialog.svelte";
  import NewTripDialog from "./NewTripDialog.svelte";

  let { compact = false }: { compact?: boolean } = $props();
  let open = $state(false);
  let share = $state(false);
  let creating = $state(false);

  const trips = $derived(allTrips());
  const cur = $derived(cloudTrip(app.trip.id));
  const isOwner = $derived(!!cur && cur.owner === cloud.user?.uid);
  const R = { owner: "", editor: "plant mit", viewer: "nur ansehen" };
  /** Ziel, Monat, Dauer, Personen; was schon im Namen steht, nicht noch einmal */
  function sub(m: (typeof trips)[number]): string {
    const n = nights(m.from, m.to);
    const info = [m.place, m.from ? monthYear(m.from) : "", n ? `${n + 1} Tage` : ""].filter(x => x && !m.name.includes(x));
    return [...info, m.people ? `${m.people} ${m.people === 1 ? "Person" : "Personen"}` : "", m.role ? R[m.role] : "", m.shared ? "geteilt" : "",
      !m.cloud && cloud.user ? "nur auf diesem Gerät" : ""].filter(Boolean).join(" · ");
  }

  function act(fn: () => unknown) { void fn(); open = false; }
  function remove() {
    const q = cur && !isOwner
      ? `„${app.trip.name}“ verlassen? Du siehst die Reise danach nicht mehr.`
      : `„${app.trip.name}“ wirklich löschen?${cur && Object.keys(cur.members).length > 1 ? " Sie verschwindet auch für alle Mitreisenden." : ""} Das lässt sich nicht rückgängig machen.`;
    if (confirm(q)) act(() => deleteTrip(app.trip.id));
  }
</script>

<div class="tmenu" class:compact>
  <button class="tm-btn" aria-haspopup="dialog" onclick={() => (open = true)} title="Reisen verwalten">
    <span class="tm-ico" aria-hidden="true">🧳</span>{#if cur}<span aria-hidden="true">☁</span>{/if}<span class="tm-name">{app.trip.name || "Reise"}</span>
  </button>
  <button class="tm-plus" onclick={() => (creating = true)} aria-label="Neue Reise" title="Neue Reise">+</button>
</div>

{#if open}
  <Modal title="Meine Reisen" onclose={() => (open = false)}>
    <div class="tm-list">
      {#each trips as m (m.id)}
        <button class="tm-trip" class:on={m.id === app.trip.id} aria-current={m.id === app.trip.id} onclick={() => act(() => switchTrip(m.id))}>
          <b>{m.cloud ? "☁ " : ""}{m.name || "Ohne Namen"}{#if m.id === app.trip.id} <span class="tm-cur">geöffnet</span>{/if}</b>
          <small>{sub(m)}</small>
        </button>
      {/each}
    </div>
    <button class="btn primary" onclick={() => { open = false; creating = true; }}>+ Neue Reise</button>
    <div class="tm-h">Geöffnete Reise</div>
    <div class="tm-acts">
      <button class="tm-act" onclick={() => act(duplicateTrip)}>Kopieren</button>
      {#if cloud.user && !cur}
        <button class="tm-act" onclick={() => act(() => moveToCloud(app.trip.id))}>☁ Im Konto speichern</button>
      {/if}
      {#if cur}
        <button class="tm-act" onclick={() => { share = true; open = false; }}>{isOwner ? "Teilen und Mitglieder" : "Mitglieder"}</button>
      {:else if cloud.configured && !cloud.user}
        <button class="tm-act" onclick={() => { cloud.showLogin = true; open = false; }}>Anmelden zum Teilen</button>
      {/if}
      {#if !access.readonly || (cur && !isOwner)}
        <button class="tm-act danger" onclick={remove}>{cur && !isOwner ? "Reise verlassen" : "Diese Reise löschen"}</button>
      {/if}
    </div>
  </Modal>
{/if}
{#if share}<ShareDialog id={app.trip.id} onclose={() => (share = false)} />{/if}
{#if creating}<NewTripDialog onclose={() => (creating = false)} />{/if}
