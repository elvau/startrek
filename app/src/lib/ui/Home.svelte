<script lang="ts">
  import { i18n, t, tn } from "../i18n/index.svelte";
  /*
   * Startseite bei jedem Besuch: Wohin geht's? Neue Reise, Reise zu einem Event, mit dem KI-Assistenten planen,
   * darunter die eigenen Reisen. Leere Entwürfe tauchen nicht auf.
   */
  import { homeTrips, openSample, openTrip, startTrip, tripFor, type TripEntry } from "../store.svelte";
  import { eur } from "../calc";
  import { FOOD_STYLES } from "../food";
  import { summarize, type TripState, type TripSummary } from "../overview";
  import { geo } from "../geo/geo.svelte";
  import { loadGeo } from "../geo/places";
  import { cloud } from "../cloud/cloud.svelte";
  import { range } from "../format";
  import { openEventPlanner } from "../event/open.svelte";
  import { openChat } from "../agent/open.svelte";
  import Account from "./Account.svelte";
  import GroupsButton from "./GroupsButton.svelte";
  import LangSelect from "./LangSelect.svelte";
  import NewTripDialog from "./NewTripDialog.svelte";

  let picking = $state(false);
  const today = new Date().toISOString().slice(0, 10);
  type Row = TripEntry & { s: TripSummary | null };
  const rows = $derived<Row[]>(homeTrips().map(m => { const tr = tripFor(m.id); return { ...m, s: tr ? summarize(tr, today, geo, i18n.lang) : null }; }));
  const stateOf = (r: Row): TripState => r.s?.state ?? (r.to && r.to < today ? "past" : "planned");
  const byDate = (dir: number) => (a: Row, b: Row) => dir * (a.from || "9999").localeCompare(b.from || "9999");
  const groups = $derived([
    { k: "planned", title: t("home.planned"), list: rows.filter(r => stateOf(r) === "planned").sort(byDate(1)) },
    { k: "booked", title: t("home.booked"), list: rows.filter(r => stateOf(r) === "booked").sort(byDate(1)) },
    { k: "past", title: t("home.past"), list: rows.filter(r => stateOf(r) === "past").sort(byDate(-1)) }
  ].filter(g => g.list.length));
  // Länder für Rundreisen: Weltdaten nur laden, wenn es Flüge gibt
  $effect(() => { if (rows.some(r => r.s && tripFor(r.id)?.items.some(i => i.cat === "flights"))) loadGeo(geo, []); });
  const foodLabel = (f: TripSummary["food"]) => (f === "hh" ? t("home.foodHh") : FOOD_STYLES.find(x => x.k === f)?.l || "");
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

    {#each groups as g (g.k)}
      {#snippet list()}
        <div class="home-trips">
          {#each g.list as m (m.id)}
            {@const x = m.s}
            <button class="home-trip" class:past={g.k === "past"} onclick={() => openTrip(m.id)}>
              <span class="ht-top"><b>{m.cloud ? "☁ " : ""}{m.name || m.place || t("trip.untitled")}</b>{#if g.k === "booked"}<span class="ht-tag">✓ {t("home.bookedTag")}</span>{/if}</span>
              {#if x}
                {#if x.where}<span class="ht-where">{x.round ? `🔁 ${t("home.round")}: ` : "📍 "}{x.where}</span>{/if}
                {#if m.from}<span class="ht-when">📅 {range(m.from, m.to)}{x.nights ? ` · ${tn("n.nights", x.nights)}` : ""}</span>{/if}
                <span class="ht-facts">
                  {#if m.people}<span>👥 {tn("n.persons", m.people)}</span>{/if}
                  {#if x.events}<span>🎟 {tn("n.events", x.events)}</span>{/if}
                  {#if x.food}<span>🍽 {foodLabel(x.food)}</span>{/if}
                </span>
                {#if x.total > 0 || x.potential > 0}<span class="ht-foot">
                  {#if x.total > 0}<span class="ht-total">{t("home.total", { v: eur(x.total) })}</span>{/if}
                  {#if x.potential > 0}<span class="ht-save">↓ {t("home.save", { v: eur(x.potential) })}</span>{/if}
                </span>{/if}
              {:else}
                <small>{t("home.noDetails")}</small>
              {/if}
            </button>
          {/each}
        </div>
      {/snippet}
      {#if g.k === "past"}
        <details class="home-past"><summary class="home-h">{g.title} <span class="muted">({g.list.length})</span></summary>{@render list()}</details>
      {:else}
        <h2 class="home-h">{g.title}</h2>
        {@render list()}
      {/if}
    {/each}

    <p class="home-more">
      <button class="linkbtn" onclick={openSample}>{t("sample.open")}</button>
      {#if cloud.configured && !cloud.user}<button class="linkbtn" onclick={() => (cloud.showLogin = true)}>{t("welcome.haveAccount")}</button>{/if}
    </p>
    <p class="home-legal"><a href="{LEGAL}impressum.html">{t("legal.imprint")}</a> · <a href="{LEGAL}datenschutz.html">{t("legal.privacy")}</a></p>
  </div>
</section>

{#if picking}<NewTripDialog onclose={() => (picking = false)} />{/if}
