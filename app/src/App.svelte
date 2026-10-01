<script lang="ts">
  import { applyDocument, t, tn } from "./lib/i18n/index.svelte";
  import { onMount } from "svelte";
  import { access, app, calc, addItem, discardDetails, setDetailed } from "./lib/store.svelte";
  import { isDetailed } from "./lib/model";
  import SimpleCard from "./lib/ui/SimpleCard.svelte";
  import { cloud } from "./lib/cloud/cloud.svelte";
  import LoginDialog from "./lib/ui/LoginDialog.svelte";
  import { eur } from "./lib/calc";
  import { CHAPTERS, CAT_CHAPTERS, SPLIT } from "./lib/chapters";
  import { initScroll } from "./lib/scroll.svelte";
  import { nights } from "./lib/format";
  import Sprite from "./lib/ui/Sprite.svelte";
  import Ambience from "./lib/ui/Ambience.svelte";
  import TopNav from "./lib/ui/TopNav.svelte";
  import Hero from "./lib/ui/Hero.svelte";
  import Chapter from "./lib/ui/Chapter.svelte";
  import TravelersCard from "./lib/ui/TravelersCard.svelte";
  import ItemCard from "./lib/ui/ItemCard.svelte";
  import TicketAside from "./lib/ui/TicketAside.svelte";
  import Dock from "./lib/ui/Dock.svelte";
  import { reveal } from "./lib/ui/reveal";
  import PresencePlan from "./lib/ui/PresencePlan.svelte";
  import Split from "./lib/ui/Split.svelte";
  import Home from "./lib/ui/Home.svelte";
  import AppFooter from "./lib/ui/AppFooter.svelte";
  import WatchPanel from "./lib/ui/WatchPanel.svelte";
  import AgentChat from "./lib/ui/AgentChat.svelte";
  import BugButton from "./lib/ui/BugButton.svelte";
  import UsagePanel from "./lib/ui/UsagePanel.svelte";
  import ConnectDialog from "./lib/ui/ConnectDialog.svelte";
  import { connect } from "./lib/connector/app.svelte";
  import { admin } from "./lib/admin/app.svelte";
  import { FLIGHTS_URL } from "./lib/flights/app";
  import FlightSearch from "./lib/ui/FlightSearch.svelte";
  import StaySearch from "./lib/ui/StaySearch.svelte";
  import EventPlanner from "./lib/ui/EventPlanner.svelte";
  import { eventPlanner } from "./lib/event/open.svelte";
  import FoodCard from "./lib/ui/FoodCard.svelte";
  import { getYourGuideLink, tiqetsLink, viatorLink } from "./lib/links";
  import { openStaySearch, staySearch } from "./lib/stays/open.svelte";
  import { flightSearch, openFlightSearch } from "./lib/flights/open.svelte";
  import { withoutTravel } from "./lib/flights/app";
  import ExploreDialog from "./lib/ui/ExploreDialog.svelte";
  import { explore, openExplore } from "./lib/activities/open.svelte";

  let sheet = $state(false);

  onMount(() => {
    try { const th = localStorage.getItem("rk-theme"); if (th) document.documentElement.dataset.theme = th; } catch {}
    applyDocument();
    const off = initScroll();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { app.editing = null; sheet = false; } };
    // Klick außerhalb des offenen Postens schließt ihn (auch auf den Plan, der sonst ausgegraut bliebe)
    const outside = (e: MouseEvent) => { if (app.editing && !(e.target as HTMLElement).closest(".card:not(.plan-card), .add, .mode, .modal-bg")) app.editing = null; };
    addEventListener("keydown", esc);
    addEventListener("click", outside);
    return () => { off(); removeEventListener("keydown", esc); removeEventListener("click", outside); };
  });

  $effect(() => { document.body.classList.toggle("editing", !!app.editing); });

  const households = $derived(Object.keys(calc.T.byHousehold).length);
  const nn = $derived(nights(app.trip.from, app.trip.to));
</script>

<Sprite />
<Ambience />
{#if app.home}
<Home />
{:else}
<TopNav />
<Hero />

<div class="wrap">
  <main>
    <Chapter ch={CHAPTERS[0]} n={1} sum={String(calc.T.active)} sub="{calc.T.active < app.trip.travelers.length ? t('app.ofTotal', { n: app.trip.travelers.length }) + ' · ' : ''}{tn('n.families', households)}">
      <article class="card" use:reveal><TravelersCard /></article>
    </Chapter>

    {#each CAT_CHAPTERS as ch, i (ch.k)}
      {@const items = app.trip.items.filter(x => x.cat === ch.k)}
      {@const det = isDetailed(app.trip, ch.k)}
      <Chapter {ch} n={i + 2} sum={eur(calc.T.byCat[ch.k])} sub={ch.k === "stay" && nn && det ? tn("n.nights", nn) : ch.sub}
        onadd={access.readonly || !det ? undefined : () => addItem(ch.k)}
        onreset={items.length ? () => { if (confirm(t("app.confirmReset", { n: items.length, label: ch.label }))) discardDetails(ch.k); } : undefined}
        mode={det ? "detail" : "simple"} onmode={access.readonly ? undefined : on => setDetailed(ch.k, on, true)}>
        {#if ch.k === "flights" && !access.readonly}
          <div class="search-row"><button class="btn primary fs-open" onclick={() => openFlightSearch()}>✈ {t("fs.open")}</button></div>
          {@const miss = withoutTravel(app.trip)}
          {#if miss.length}
            <p class="search-row miss-travel">⚠ {t("fl.missing", { who: miss.slice(0, 6).map(x => x.name).join(", ") + (miss.length > 6 ? ` +${miss.length - 6}` : "") })}
              <button class="linkbtn miss-search" onclick={() => openFlightSearch({ ids: miss.map(x => x.id) })}>✈ {t("fl.searchMissing")}</button></p>
          {/if}
        {:else if ch.k === "attractions"}
          {@const aq = { place: app.trip.place, from: app.trip.from, to: app.trip.to }}
          {#if app.trip.place && !access.readonly && FLIGHTS_URL}
            <div class="search-row">
              <button class="btn primary xp-open" onclick={() => openExplore("events")}>🎟 {t("xp.events")}</button>
              <button class="btn xp-open-tours" onclick={() => openExplore("tours")}>🎡 {t("xp.tours")}</button>
            </div>
          {/if}
          <p class="search-row muted small fs-direct">
            {#if app.trip.place}{t("att.find", { place: app.trip.place })} <a href={getYourGuideLink(aq)} target="_blank" rel="noopener noreferrer">GetYourGuide ↗</a> · <a href={viatorLink(aq)} target="_blank" rel="noopener noreferrer">Viator ↗</a> · <a href={tiqetsLink(aq)} target="_blank" rel="noopener noreferrer">Tiqets ↗</a>
            {:else}{t("att.noPlace")}{/if}
          </p>
        {:else if ch.k === "stay" && !access.readonly}
          <div class="search-row"><button class="btn primary st-open" onclick={() => openStaySearch()}>🛏 {t("st.open")}</button></div>
        {/if}
        {#if ch.k === "misc"}<article class="card plan-card" use:reveal><FoodCard /></article>{/if}
        {#if !det}
          <SimpleCard cat={ch.k} label={ch.label} />
        {:else}
          {#if ch.k === "stay"}<article class="card plan-card" use:reveal><PresencePlan /></article>{/if}
          {#each items as item (item.id)}
            <ItemCard {item} icon={ch.icon} />
          {:else}
            <div class="empty-ch">{t("app.empty")}</div>
          {/each}
        {/if}
      </Chapter>
    {/each}

    <Chapter ch={SPLIT} n={CHAPTERS.length} sum={eur(calc.T.total)} sub={tn("n.families", households)}>
      <Split />
    </Chapter>
    <WatchPanel />
  </main>
  <TicketAside />
</div>

<AppFooter />

<Dock onopen={() => (sheet = true)} />
{#if sheet}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-bg sheet-bg" onclick={e => { if (e.target === e.currentTarget) sheet = false; }}>
    <div class="sheet-in" role="dialog" aria-modal="true" aria-label={t("overview")}>
      <button class="x sheet-x" onclick={() => (sheet = false)} aria-label={t("close")}>✕</button>
      <TicketAside sheet onpick={() => (sheet = false)} />
    </div>
  </div>
{/if}
{/if}
{#if cloud.configured}<AgentChat />{/if}
{#if cloud.configured && FLIGHTS_URL}<BugButton />{/if}
{#if admin.open && admin.is && cloud.user}<UsagePanel />{/if}
{#if connect.open && cloud.user}<ConnectDialog />{/if}
{#if cloud.showLogin && !cloud.user}<LoginDialog />{/if}
{#if flightSearch.open}<FlightSearch scope={flightSearch.scope} onclose={() => (flightSearch.open = false)} />{/if}
{#if eventPlanner.open}<EventPlanner onclose={() => (eventPlanner.open = false)} />{/if}
{#if explore.open}<ExploreDialog onclose={() => (explore.open = false)} />{/if}
{#if staySearch.open}<StaySearch scope={staySearch.scope} onclose={() => (staySearch.open = false)} />{/if}
