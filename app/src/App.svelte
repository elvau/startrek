<script lang="ts">
  import { applyDocument, t, tn } from "./lib/i18n/index.svelte";
  import { onMount } from "svelte";
  import { loadRates } from "./lib/currency.svelte";
  import { access, app, calc, addItem, discardDetails, setDetailed } from "./lib/store.svelte";
  import { isDetailed } from "./lib/model";
  import SimpleCard from "./lib/ui/SimpleCard.svelte";
  import { cloud } from "./lib/cloud/cloud.svelte";
  import LoginDialog from "./lib/ui/LoginDialog.svelte";
  import { eur } from "./lib/calc";
  import { CHAPTERS, CAT_CHAPTERS, SPLIT } from "./lib/chapters";
  import { initScroll } from "./lib/scroll.svelte";
  import { dayShort, nights } from "./lib/format";
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
  import TripMap from "./lib/ui/TripMap.svelte";
  import GroundOptions from "./lib/ui/GroundOptions.svelte";
  import { getYourGuideLink, tiqetsLink } from "./lib/links";
  import ViatorLink from "./lib/ui/ViatorLink.svelte";
  import { partner } from "./lib/partnerState.svelte";
  import { openStaySearch, staySearch } from "./lib/stays/open.svelte";
  import { flightSearch, openFlightSearch } from "./lib/flights/open.svelte";
  import { withoutTravel } from "./lib/flights/app";
  import ExploreDialog from "./lib/ui/ExploreDialog.svelte";
  import { explore, openExplore } from "./lib/activities/open.svelte";
  import { openEventPlanner } from "./lib/event/open.svelte";
  import { eventWindow } from "./lib/activities/window";
  import { CAR_LINKS, INSURANCE_LINKS, carItem, carPerDay, carWindow, insuranceItem, kayakCarLink } from "./lib/extras";
  import { airportOf, ccOf } from "./lib/geo/places";
  import { showItem } from "./lib/ui/showItem";
  import { stationName } from "./lib/stays/stationName";
  import { airportData, ensureAirports, ensureGeo, geo } from "./lib/geo/geo.svelte";

  let sheet = $state(false);
  // Karte der Reise, aufgeklappt im Kapitel Unterkunft oder Erlebnisse
  let mapOpen = $state<"stay" | "attractions" | null>(null);

  // Tageskurse für die Anzeige in anderer Währung und für Preise in Fremdwährung (einmal am Tag)
  onMount(() => { void loadRates(); });
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
  // Ort und Zeitraum für Events vor Ort (aus der Reise oder den Flügen)
  // aufgeklappte Suchen gehören zur Reise, in der sie geöffnet wurden: beim Wechsel der Reise zuklappen
  let searchTrip = app.trip.id;
  $effect(() => {
    const id = app.trip.id;
    if (id === searchTrip) return;
    searchTrip = id;
    flightSearch.open = false; staySearch.open = false; explore.open = false; mapOpen = null;
  });

  // Mietwagen und Reiseversicherung als Richtwert-Posten
  async function addCar() {
    await ensureGeo(app.trip).catch(() => {});
    const w = carWindow(app.trip) || { pick: "", drop: "", days: Math.max(1, nn || 1) };
    setDetailed("transport", true);
    // Preisniveau des Ziellandes (Reise, sonst Land des Ankunftsflughafens)
    const cc = ccOf(geo, app.trip.country) || ("ap" in w && w.ap ? airportOf(geo, w.ap)?.cc : undefined);
    const it = carItem(w, carPerDay(geo.world.find(x => x.k === cc)?.pli));
    app.trip.items.push(it);
    showItem(it.id);
  }
  function addInsurance() {
    const T = calc.T;
    const cost = (T.byCat.flights || 0) + (T.byCat.stay || 0) + (T.byCat.transport || 0) + (T.byCat.attractions || 0);
    setDetailed("misc", true);
    const it = insuranceItem(cost, T.active || app.trip.travelers.length);
    app.trip.items.push(it);
    showItem(it.id);
  }
  const evWin = $derived(eventWindow(app.trip, ap => stationName(geo, airportData, ap)));
  $effect(() => { if (!app.trip.place && app.trip.items.some(i => i.cat === "flights")) void ensureAirports(); });
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
          <div class="search-row"><button class="btn primary fs-open" aria-expanded={flightSearch.open} onclick={() => (flightSearch.open ? (flightSearch.open = false) : openFlightSearch())}>✈ {t("fs.open")} <span aria-hidden="true">{flightSearch.open ? "▴" : "▾"}</span></button></div>
          <!-- Suche klappt im Kapitel auf statt als Fenster (auch aus Posten und Plan heraus) -->
          {#if flightSearch.open}{#key flightSearch.scope}<FlightSearch inline scope={flightSearch.scope} onclose={() => (flightSearch.open = false)} />{/key}{/if}
          {@const miss = withoutTravel(app.trip)}
          {#if miss.length}
            <p class="search-row miss-travel">⚠ {t("fl.missing", { who: miss.slice(0, 6).map(x => x.name).join(", ") + (miss.length > 6 ? ` +${miss.length - 6}` : "") })}
              <button class="linkbtn miss-search" onclick={() => openFlightSearch({ ids: miss.map(x => x.id) })}>✈ {t("fl.searchMissing")}</button></p>
          {/if}
        {:else if ch.k === "attractions"}
          {@const aq = { place: evWin.city, from: evWin.from, to: evWin.to }}
          {#if app.trip.event}
            {@const ev = app.trip.event}
            <p class="search-row att-event">🎟 <b>{ev.name}</b> <span class="muted small">{[`${dayShort(ev.start.slice(0, 10))} ${ev.start.slice(11, 16)}`, ev.venue].filter(Boolean).join(" · ")}</span></p>
          {/if}
          {#if !access.readonly}
            <!-- Reise zu einem Event (wie oben in der Reise) auch hier; Events und Touren am Ziel, sobald es eines gibt -->
            <div class="search-row">
              {#if evWin.city && FLIGHTS_URL}<button class="btn primary xp-open-tours" onclick={() => openExplore("tours")}>🎡 {t("xp.tours")}</button>{/if}
              {#if evWin.city && FLIGHTS_URL}<button class="btn xp-open" onclick={() => openExplore("events")}>🎟 {t("xp.events")}</button>{/if}
              <button class="btn att-ev" class:primary={!evWin.city} onclick={openEventPlanner}>🏟 {app.trip.event ? t("ev.change") : t("ev.btn")}</button>
              <button class="btn tm-open" aria-expanded={mapOpen === "attractions"} onclick={() => (mapOpen = mapOpen === "attractions" ? null : "attractions")}>🗺 {t("tmap.open")}</button>
            </div>
            {#if mapOpen === "attractions"}<TripMap onclose={() => (mapOpen = null)} />{/if}
            <!-- Events und Touren klappen hier im Kapitel auf -->
            {#if explore.open}<ExploreDialog inline onclose={() => (explore.open = false)} />{/if}
          {/if}
          <p class="search-row muted small fs-direct">
            {#if evWin.city}{t("att.find", { place: evWin.city })} <a href={getYourGuideLink(aq)} target="_blank" rel="noopener noreferrer">GetYourGuide ↗</a> · <ViatorLink q={aq} /> · <a href={tiqetsLink(aq)} target="_blank" rel="noopener noreferrer">Tiqets ↗</a>
            {:else}{t("att.noPlace")}{/if}
          </p>
          {#if evWin.city && partner.on}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
        {:else if ch.k === "transport"}
          <!-- Mietwagen: Richtwert-Posten aus den Flugzeiten, dazu Vergleich mit Ort und Zeiten -->
          {@const cw = carWindow(app.trip)}
          <GroundOptions city={evWin.city} />
          {#if !access.readonly}<div class="search-row"><button class="btn primary car-add" onclick={addCar}>🚗 {t("car.add")}</button></div>{/if}
          <p class="search-row muted small fs-direct car-links">{t("car.compare")}
            {#if cw}<a href={kayakCarLink(cw, evWin.city)} target="_blank" rel="noopener noreferrer">KAYAK ↗</a> ·{/if}
            {#each CAR_LINKS as l, i (l.name)}{i ? " · " : ""}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.name} ↗</a>{/each}
            {#if cw}<br />{t("car.when", { a: `${cw.ap ? `${cw.ap} ` : ""}${cw.pick.slice(8, 10)}.${cw.pick.slice(5, 7)}. ${cw.pick.slice(11, 16)}`, b: `${cw.drop.slice(8, 10)}.${cw.drop.slice(5, 7)}. ${cw.drop.slice(11, 16)}`, n: cw.days })}{/if}
          </p>
        {:else if ch.k === "misc"}
          <!-- Reiseversicherung: neutrale Schätzung (keine Beratung), Links zu Anbietern -->
          {#if !access.readonly}<div class="search-row"><button class="btn ins-add" onclick={addInsurance}>🛡 {t("ins.add")}</button></div>{/if}
          <p class="search-row muted small fs-direct ins-links">{t("ins.compare")}
            {#each INSURANCE_LINKS as l, i (l.name)}{i ? " · " : ""}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.name} ↗</a>{/each}
            <br />{t("ins.hint")}
          </p>
        {:else if ch.k === "stay" && !access.readonly}
          <div class="search-row"><button class="btn primary st-open" aria-expanded={staySearch.open} onclick={() => (staySearch.open ? (staySearch.open = false) : openStaySearch())}>🛏 {t("st.open")} <span aria-hidden="true">{staySearch.open ? "▴" : "▾"}</span></button>
            <button class="btn tm-open" aria-expanded={mapOpen === "stay"} onclick={() => (mapOpen = mapOpen === "stay" ? null : "stay")}>🗺 {t("tmap.open")}</button></div>
          {#if mapOpen === "stay"}<TripMap onclose={() => (mapOpen = null)} />{/if}
          {#if staySearch.open}{#key staySearch.scope}<StaySearch inline scope={staySearch.scope} onclose={() => (staySearch.open = false)} />{/key}{/if}
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

    <Chapter ch={SPLIT} n={CHAPTERS.length} sum={eur(calc.T.due)} sub={tn("n.families", households)}>
      <Split />
    </Chapter>
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
{#if eventPlanner.open}<EventPlanner onclose={() => (eventPlanner.open = false)} />{/if}
