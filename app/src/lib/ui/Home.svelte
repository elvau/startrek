<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  /*
   * Startseite bei jedem Besuch: Wohin geht's? Neue Reise, Reise zu einem Event, mit dem KI-Assistenten planen,
   * darunter die eigenen Reisen. Leere Entwürfe tauchen nicht auf.
   */
  import { homeTrips, openSample, openTrip, startTrip } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { range } from "../format";
  import { openEventPlanner } from "../event/open.svelte";
  import { openChat } from "../agent/open.svelte";
  import Account from "./Account.svelte";
  import GroupsButton from "./GroupsButton.svelte";
  import LangSelect from "./LangSelect.svelte";
  import NewTripDialog from "./NewTripDialog.svelte";

  let picking = $state(false);
  const trips = $derived(homeTrips());
  // Impressum und Datenschutz liegen neben der App
  const LEGAL = (import.meta.env.BASE_URL as string) || "/";
  function event() { startTrip(); openEventPlanner(); }
</script>

<section class="start" data-ch="hero">
  <div class="home-bar">
    <span class="brand home-brand">Split<span class="brand-y">&amp;</span>Fly</span>
    <div class="hero-r">
      <GroupsButton />
      {#if cloud.configured}<Account />{/if}
      <LangSelect />
    </div>
  </div>

  <div class="home-in">
    <h1 class="home-title">{t("home.title")}</h1>
    <p class="home-lead">{t("home.lead")}</p>

    <div class="home-acts">
      <button class="home-act home-new" onclick={() => (picking = true)}>
        <span class="home-ico" aria-hidden="true">🧳</span><b>{t("home.new")}</b><small>{t("home.newSub")}</small>
      </button>
      <button class="home-act home-event" onclick={event}>
        <span class="home-ico" aria-hidden="true">🎟</span><b>{t("home.event")}</b><small>{t("home.eventSub")}</small>
      </button>
      {#if cloud.configured}
        <button class="home-act home-ai" onclick={openChat}>
          <span class="home-ico" aria-hidden="true">✨</span><b>{t("home.ai")}</b><small>{t("home.aiSub")}</small>
        </button>
      {/if}
    </div>

    {#if trips.length}
      <h2 class="home-h">{t("home.trips")}</h2>
      <div class="home-trips">
        {#each trips as m (m.id)}
          <button class="home-trip" onclick={() => openTrip(m.id)}>
            <b>{m.cloud ? "☁ " : ""}{m.name || m.place || t("trip.untitled")}</b>
            <small>{[m.name && m.place && m.place !== m.name ? m.place : "", m.from ? range(m.from, m.to) : "", m.people ? tn("n.persons", m.people) : ""].filter(Boolean).join(" · ") || t("home.noDetails")}</small>
          </button>
        {/each}
      </div>
    {/if}

    <p class="home-more">
      <button class="linkbtn" onclick={openSample}>{t("sample.open")}</button>
      {#if cloud.configured && !cloud.user}<button class="linkbtn" onclick={() => (cloud.showLogin = true)}>{t("welcome.haveAccount")}</button>{/if}
    </p>
    <p class="home-legal"><a href="{LEGAL}impressum.html">{t("legal.imprint")}</a> · <a href="{LEGAL}datenschutz.html">{t("legal.privacy")}</a></p>
  </div>
</section>

{#if picking}<NewTripDialog onclose={() => (picking = false)} />{/if}
