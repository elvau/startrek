<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  /* Oben links: „Reisen“ öffnet die Übersicht aller Reisen, „+“ legt eine neue an */
  import type { Key } from "../i18n/index.svelte";
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
  const R = (r: string) => (r === "owner" ? "" : t(`role.${r}` as Key));
  /** Ziel, Monat, Dauer, Personen; was schon im Namen steht, nicht noch einmal */
  function sub(m: (typeof trips)[number]): string {
    const n = nights(m.from, m.to);
    const info = [m.place, m.from ? monthYear(m.from) : "", n ? tn("n.days", n + 1) : ""].filter(x => x && !m.name.includes(x));
    return [...info, m.people ? tn("n.persons", m.people) : "", m.role ? R(m.role) : "", m.shared ? t("tm.shared") : "",
      !m.cloud && cloud.user ? t("tm.localOnly") : ""].filter(Boolean).join(" · ");
  }

  function act(fn: () => unknown) { void fn(); open = false; }
  function remove() {
    const q = cur && !isOwner
      ? t("tm.leaveConfirm", { name: app.trip.name })
      : [t("tm.deleteConfirm", { name: app.trip.name }), cur && Object.keys(cur.members).length > 1 ? t("tm.deleteAll") : "", t("tm.noUndo")].filter(Boolean).join(" ");
    if (confirm(q)) act(() => deleteTrip(app.trip.id));
  }
</script>

<div class="tmenu" class:compact>
  <button class="tm-btn" aria-haspopup="dialog" onclick={() => (open = true)} title={t("tm.manage")}>
    <span class="tm-ico" aria-hidden="true">🧳</span>{#if cur}<span aria-hidden="true">☁</span>{/if}<span class="tm-name">{app.trip.name || app.trip.place || t("trip.untitled")}</span>
  </button>
  <button class="tm-plus" onclick={() => (creating = true)} aria-label={t("newtrip.title")} title={t("newtrip.title")}>+</button>
</div>

{#if open}
  <Modal title={t("tm.mine")} onclose={() => (open = false)}>
    <div class="tm-list">
      {#each trips as m (m.id)}
        <button class="tm-trip" class:on={m.id === app.trip.id} aria-current={m.id === app.trip.id} onclick={() => act(() => switchTrip(m.id, "Reise-Menü"))}>
          <b>{m.cloud ? "☁ " : ""}{m.name || m.place || t("trip.untitled")}{#if m.id === app.trip.id} <span class="tm-cur">{t("tm.open")}</span>{/if}</b>
          <small>{sub(m)}</small>
        </button>
      {/each}
    </div>
    <button class="btn primary" onclick={() => { open = false; creating = true; }}>+ {t("newtrip.title")}</button>
    <div class="tm-h">{t("tm.current")}</div>
    <div class="tm-acts">
      <button class="tm-act" onclick={() => act(duplicateTrip)}>{t("tm.copy")}</button>
      {#if cloud.user && !cur}
        <button class="tm-act" onclick={() => act(() => moveToCloud(app.trip.id))}>☁ {t("tm.saveCloud")}</button>
      {/if}
      {#if cur}
        <button class="tm-act" onclick={() => { share = true; open = false; }}>{isOwner ? t("tm.shareMembers") : t("tm.members")}</button>
      {:else if cloud.configured && !cloud.user}
        <button class="tm-act" onclick={() => { cloud.showLogin = true; open = false; }}>{t("tm.loginShare")}</button>
      {/if}
      {#if !access.readonly || (cur && !isOwner)}
        <button class="tm-act danger" onclick={remove}>{cur && !isOwner ? t("tm.leave") : t("tm.delete")}</button>
      {/if}
    </div>
  </Modal>
{/if}
{#if share}<ShareDialog id={app.trip.id} onclose={() => (share = false)} />{/if}
{#if creating}<NewTripDialog onclose={() => (creating = false)} />{/if}
