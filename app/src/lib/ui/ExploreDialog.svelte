<script lang="ts">
  /*
   * Erlebnisse finden: was am Reiseort im Reisezeitraum läuft (Ticketmaster, Fußball-Spielpläne) und
   * buchbare Touren und Tickets (Viator). Antippen legt einen Posten in „Erlebnisse“ an, der Dialog bleibt offen.
   */
  import { i18n, t, type Key } from "../i18n/index.svelte";
  import { app, setDetailed } from "../store.svelte";
  import { eur } from "../calc";
  import { dayShort, nights, range } from "../format";
  import { evFacets, evPasses, noEvFilter, noTourFilter, sortTours, tourFacets, tourPasses, type TourSort } from "../activities/filter";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { stationName } from "../stays/stationName";
  import { eventWindow, inWindow } from "../activities/window";
  import { ccOf, findCity } from "../geo/places";
  import { noteError } from "../bugs/log";
  import { getYourGuideLink, tiqetsLink } from "../links";
  import ViatorLink from "./ViatorLink.svelte";
  import { partner } from "../partnerState.svelte";
  import { uniqueById } from "../events/search";
  import { activityItem, duration, eventItem, searchActivitiesRemote, searchLocalEvents, takeInto } from "../activities/app";
  import { explore } from "../activities/open.svelte";
  import { itinerary, stations } from "../itinerary";
  import type { EventHit } from "../events/types";
  import type { ActivityHit } from "../activities/types";
  import Modal from "./Modal.svelte";
  import { showItem } from "./showItem";

  let { onclose, inline = false }: { onclose: () => void; inline?: boolean } = $props();
  const trip = app.trip;
  // Ort und Zeitraum aus der Reise, sonst aus den Flügen: Landung + 5 h bis Rückflug − 5 h
  $effect(() => { void ensureAirports(); });
  const win0 = $derived(eventWindow(trip, ap => stationName(geo, airportData, ap)));
  // Rundreise: Orte der Reise (Stationen im Tagesplan) zur Wahl, dazu ein eigener Ort (z. B. Hakone für einen Tagesausflug)
  const places = $derived.by(() => {
    const days = itinerary(trip);
    const sts = stations(days).map(s => ({ place: s.place, from: s.from, to: days.find(d => d.date > s.from && d.place !== s.place)?.date || days.at(-1)?.date || s.from }));
    return sts.length > 1 ? sts : [];
  });
  let pick = $state<{ place: string; from?: string; to?: string } | null>(null);
  let other = $state("");
  const win = $derived(pick ? { ...win0, city: pick.place, ...(pick.from ? { from: pick.from, to: pick.to, start: undefined, end: undefined } : {}) } : win0);
  const city = $derived(win.city);
  function choose(p: { place: string; from?: string; to?: string } | null) {
    pick = p; tours = null; events = null; searchedFor = ""; tof = noTourFilter(); evf = noEvFilter();
    if (explore.tab === "tours") void findTours();
  }
  const stamp = (iso: string) => `${dayShort(iso.slice(0, 10))} ${iso.slice(11, 16)}`;
  const when = $derived(win.start || win.end
    ? `${win.start ? stamp(win.start) : dayShort(win.from!)} – ${win.end ? stamp(win.end) : dayShort(win.to!)}`
    : win.from ? range(win.from, win.to || win.from) : t("xp.anyDate"));
  const span = $derived(win.from ? { from: win.from, to: win.to || win.from } : {});
  // Events stehen oft erst wenige Monate vorher fest: bei leerem Ergebnis für ferne Reisen „noch nicht“ statt „gibt es nicht“
  const farOut = $derived(!!win.from && win.from > new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10));

  let kw = $state("");
  let evBusy = $state(false), evErr = $state(""), events = $state<EventHit[] | null>(null);
  let toBusy = $state(false), toErr = $state(""), tours = $state<ActivityHit[] | null>(null), toursOff = $state(false), toursWhy = $state("");
  let taken = $state<Record<string, boolean>>({});
  // Filter auf die Treffer (keine neue Anfrage)
  let evf = $state(noEvFilter());
  let tof = $state(noTourFilter());
  let tsort = $state<TourSort>("default");
  const evShown = $derived((events || []).filter(h => evPasses(h, evf)));
  const evFc = $derived(evFacets(events || [], evf));
  const toShown = $derived(sortTours((tours || []).filter(a => tourPasses(a, tof)), tsort));
  const toFc = $derived(tourFacets(tours || [], tof));
  const toggleCat = (c: string) => (evf.cats = evf.cats.includes(c) ? evf.cats.filter(x => x !== c) : [...evf.cats, c]);
  /** „Tag 3 · Sa 14.08.“: Reisetag ab dem ersten Tag des Zeitfensters */
  const dayLabel = (d: string) => (win.from && d >= win.from ? `${t("xp.f.dayN", { n: nights(win.from, d) + 1 })} · ${dayShort(d)}` : dayShort(d));
  // Regler Preis pro Person (Touren): ganz rechts heißt egal
  let priceMax = $state(0);
  $effect(() => { if (tof.maxPrice == null && toFc.price) priceMax = toFc.price.hi; });
  $effect(() => { const v = priceMax; tof.maxPrice = toFc.price && v && v < toFc.price.hi ? v : null; });

  /** Stadtmitte und englischer Name aus den Ortsdaten (für den Umkreis bei Ticketmaster und die Vereine) */
  async function where() {
    await ensureGeo(trip).catch(() => {});
    await ensureAirports().catch(() => {});
    const cc = ccOf(geo, trip.country);
    const c = findCity(geo, city, cc);
    return { city, ...(c?.en ? { cityEn: c.en } : {}), ...(c?.cc || cc ? { cc: c?.cc || cc! } : {}), ...(c ? { lat: c.lat, lon: c.lon } : {}) };
  }

  async function findEvents(e?: Event) {
    e?.preventDefault();
    if (!city) return;
    evBusy = true; evErr = ""; events = null; evf = noEvFilter();
    try {
      const res = await searchLocalEvents({ q: kw.trim(), ...(await where()), ...span });
      if (!res.sources.some(s => s.configured)) { evErr = t("evs.notReady"); return; }
      events = uniqueById(res.events || []).filter(h => inWindow(h.start, win));
      if (!events.length && res.sources.every(s => !s.ok)) {
        evErr = res.sources.find(s => s.error)?.error || t("xp.noEvents");
        noteError(`Events vor Ort: ${res.sources.map(s => `${s.id} ${s.error || (s.ok ? "ok" : "aus")}`).join(", ")}`);
      }
    } catch (err) { evErr = (err as Error).message; noteError(`Events vor Ort: ${evErr}`); }
    finally { evBusy = false; }
  }

  // Ort, für den die Touren gesucht werden/wurden (wechselt man den Ort während der Suche, zählt nur die neue)
  let toFor = "";
  async function findTours() {
    if (!city || (toFor === city && (tours || toBusy))) return;
    const c = city;
    toFor = c; toBusy = true; toErr = "";
    try {
      const res = await searchActivitiesRemote({ place: c, lang: i18n.lang, ...span });
      if (c !== city) return;
      toursOff = !res.sources.some(s => s.configured);
      // Viator nur auf splitandfly.com (Bedingungen der Viator-API): in der Testumgebung Hinweis statt Touren
      toursWhy = res.sources.find(s => s.error === "domain") ? "domain" : "";
      tours = uniqueById(res.activities || []);
      const bad = res.sources.find(s => s.configured && !s.ok);
      if (!tours.length && bad) { toErr = bad.error || t("xp.noTours"); noteError(`Touren: ${bad.error}`); }
    } catch (err) { if (c === city) { toErr = (err as Error).message; noteError(`Touren: ${toErr}`); } }
    finally { if (c === city) toBusy = false; }
  }

  // Events suchen, sobald der Reiter offen ist und der Ort feststeht; Touren ebenso
  let searchedFor = "";
  $effect(() => { if (city && explore.tab === "events" && city !== searchedFor) { searchedFor = city; void findEvents(); } });
  $effect(() => { if (explore.tab === "tours") void findTours(); });

  function take(id: string, make: () => ReturnType<typeof eventItem>) {
    setDetailed("attractions", true);
    const item = takeInto(app.trip, make());
    taken[id] = true;
    showItem(item.id);
  }
  const money = (n: number, cur: string) => (cur === "EUR" ? eur(n) : `${Math.round(n)} ${cur}`);
  const aq = $derived({ place: city, from: win.from, to: win.to });
</script>

<Modal title={t("xp.title")} {onclose} wide {inline}>
  <div class="xp">
    {#if !city}
      <p class="warnline">{t("xp.noPlace")}</p>
      <form class="xp-other" onsubmit={e => { e.preventDefault(); if (other.trim()) choose({ place: other.trim() }); }}>
        <input bind:value={other} placeholder={t("xp.otherPh")} aria-label={t("xp.other")} /><button class="btn sm" disabled={!other.trim()}>{t("xp.otherGo")}</button>
      </form>
    {:else}
      <p class="muted small xp-where">📍 {city} · 📅 {when}</p>
      <div class="chips xp-places">
        {#each places as pl (pl.place + pl.from)}
          <button type="button" class="chip sm" class:on={city === pl.place} onclick={() => choose(pl)}>{pl.place} <small>{dayShort(pl.from)}</small></button>
        {/each}
        <form class="xp-other" onsubmit={e => { e.preventDefault(); if (other.trim()) choose({ place: other.trim() }); }}>
          <input bind:value={other} placeholder={t("xp.otherPh")} aria-label={t("xp.other")} /><button class="btn sm" disabled={!other.trim()}>{t("xp.otherGo")}</button>
        </form>
      </div>
      <div class="xp-tabs" role="tablist">
        <button role="tab" class="xp-tab" class:on={explore.tab === "tours"} aria-selected={explore.tab === "tours"} onclick={() => (explore.tab = "tours")}>🎡 {t("xp.tours")}</button>
        <button role="tab" class="xp-tab" class:on={explore.tab === "events"} aria-selected={explore.tab === "events"} onclick={() => (explore.tab = "events")}>🎟 {t("xp.events")}</button>
      </div>

      {#if explore.tab === "events"}
        <form class="ev-find" onsubmit={findEvents}>
          <label class="f ev-grow">{t("xp.kw")}<input type="search" enterkeyhint="search" bind:value={kw} placeholder={t("xp.kwPh")} /></label>
          <button class="btn" disabled={evBusy}>{evBusy ? t("evs.busy") : t("evs.go")}</button>
        </form>
        {#if evErr}<p class="warnline">{evErr}</p>{/if}
        {#if evBusy && !events}<p class="muted small">{t("evs.busy")}</p>{/if}
        {#if events}
          {#if !events.length && !evErr}<p class="muted small">{t("xp.noEvents")}</p>{#if farOut}<p class="warnline xp-farout">{t("xp.farOut")}</p>{/if}{/if}
          {#if events.length > 1}
            <div class="ff xp-f">
              {#if evFc.days.length > 1}
                <div class="chips xp-days" aria-label={t("xp.f.days")}>
                  {#each evFc.days as d (d.key)}
                    <button type="button" class="chip sm" class:on={evf.day === d.key} aria-pressed={evf.day === d.key} onclick={() => (evf.day = evf.day === d.key ? null : d.key)}>{dayLabel(d.key)} <small>{d.count}</small></button>
                  {/each}
                </div>
              {/if}
              {#if evFc.parts.length > 1 || evFc.cats.length > 1}
                <div class="chips xp-parts">
                  {#if evFc.parts.length > 1}
                    {#each evFc.parts as p (p.key)}
                      <button type="button" class="chip sm" class:on={evf.part === p.key} aria-pressed={evf.part === p.key} onclick={() => (evf.part = evf.part === p.key ? null : p.key)}>{t(`xp.f.${p.key}` as Key)} <small>{p.count}</small></button>
                    {/each}
                  {/if}
                  {#if evFc.cats.length > 1}
                    {#each evFc.cats as c (c.key)}
                      <button type="button" class="chip sm" class:on={evf.cats.includes(c.key)} aria-pressed={evf.cats.includes(c.key)} onclick={() => toggleCat(c.key)}>{c.key} <small>{c.count}</small></button>
                    {/each}
                  {/if}
                </div>
              {/if}
              {#if evShown.length < events.length}<p class="muted small">{t("fs.f.shown", { n: evShown.length, of: events.length })} · <button type="button" class="linkbtn" onclick={() => (evf = noEvFilter())}>{t("fs.f.reset")}</button></p>{/if}
            </div>
          {/if}
          <div class="xp-list">
            {#each evShown as h (h.id)}
              <article class="xp-card xp-ev">
                <div class="xp-b">
                  <b>{h.name}</b>
                  <span class="muted small">{dayShort(h.start.slice(0, 10))}{h.start.length > 10 ? ` ${h.start.slice(11, 16)}` : ""}{h.venue ? ` · ${h.venue}` : ""}{h.category ? ` · ${h.category}` : ""}</span>
                  {#if h.price}<span class="xp-price">{t("xp.from", { p: money(h.price.min, h.price.currency) })}</span>{/if}
                </div>
                <div class="xp-acts">
                  {#if h.url}<a class="linkbtn" href={h.url} target="_blank" rel="noopener noreferrer">{t("xp.tickets")} ↗</a>{/if}
                  <button class="btn xp-take" class:primary={!taken[h.id]} disabled={taken[h.id]} onclick={() => take(h.id, () => eventItem(h))}>{taken[h.id] ? t("xp.taken") : t("xp.take")}</button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      {:else}
        {#if toBusy}<p class="muted small">{t("evs.busy")}</p>{/if}
        {#if toErr}<p class="warnline">{toErr}</p>{/if}
        {#if toursOff}
          <p class="muted small">{toursWhy === "domain" ? t("xp.toursLiveOnly") : t("xp.toursSetup")}</p>
        {:else if tours}
          {#if !tours.length && !toErr}<p class="muted small">{t("xp.noTours")}</p>{/if}
          {#if tours.length > 1}
            <div class="ff xp-f">
              <div class="chips fs-sort" role="radiogroup" aria-label={t("search.sort")}>
                {#each [["default", "xp.s.default"], ["popular", "xp.s.popular"], ["rating", "st.bestRated"], ["price", "search.cheapest"], ["short", "xp.s.short"]] as [k, l] (k)}
                  <button type="button" role="radio" aria-checked={tsort === k} class="chip" class:on={tsort === k} onclick={() => (tsort = k as TourSort)}>{t(l as Key)}</button>
                {/each}
              </div>
              <div class="chips xp-lens">
                {#each toFc.lens as x (x.key)}
                  <button type="button" class="chip sm" class:on={tof.len === x.key} aria-pressed={tof.len === x.key} onclick={() => (tof.len = tof.len === x.key ? null : x.key)}>{t(`xp.f.${x.key}` as Key)} <small>{x.count}{x.min ? ` · ${t("fs.cal.from", { v: eur(x.min) })}` : ""}</small></button>
                {/each}
                {#each toFc.ratings as x (x.key)}
                  <button type="button" class="chip sm" class:on={tof.minRating === x.key} aria-pressed={tof.minRating === x.key} onclick={() => (tof.minRating = tof.minRating === x.key ? null : x.key)}>★ {t("xp.f.ratingFrom", { n: String(x.key).replace(".", i18n.lang === "en" ? "." : ",") })} <small>{x.count}</small></button>
                {/each}
              </div>
              {#if toFc.price && toFc.price.hi > toFc.price.lo}
                <label class="f ff-hours"><span class="dual-head"><span class="dlabel">{t("xp.f.price")}</span><b class="num">{tof.maxPrice != null ? t("sf.upTo", { v: eur(tof.maxPrice) }) : t("st.any")}</b></span>
                  <input type="range" min={toFc.price.lo} max={toFc.price.hi} step="5" bind:value={priceMax} aria-label={t("xp.f.price")} /></label>
              {/if}
              {#if toShown.length < tours.length}<p class="muted small">{t("fs.f.shown", { n: toShown.length, of: tours.length })} · <button type="button" class="linkbtn" onclick={() => { tof = noTourFilter(); priceMax = toFc.price?.hi || 0; }}>{t("fs.f.reset")}</button></p>{/if}
            </div>
          {/if}
          <div class="xp-list">
            {#each toShown as a (a.id)}
              <article class="xp-card xp-tour">
                {#if a.image}<img class="xp-img" src={a.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={e => ((e.currentTarget as HTMLImageElement).hidden = true)} />{/if}
                <div class="xp-b">
                  <b>{a.title}</b>
                  <span class="muted small">{a.rating ? `★ ${a.rating.toFixed(1)}${a.reviews ? ` (${a.reviews})` : ""}` : ""}{a.rating && a.minutes ? " · " : ""}{a.minutes ? `⏱ ${duration(a.minutes)}` : ""}</span>
                  {#if a.price}<span class="xp-price">{t("xp.from", { p: money(a.price, a.currency) })}</span>{/if}
                </div>
                <div class="xp-acts">
                  {#if a.url}<a class="linkbtn" href={a.url} target="_blank" rel="noopener noreferrer">{t("xp.details")} ↗</a>{/if}
                  <button class="btn xp-take" class:primary={!taken[a.id]} disabled={taken[a.id]} onclick={() => take(a.id, () => activityItem(a))}>{taken[a.id] ? t("xp.taken") : t("xp.take")}</button>
                </div>
              </article>
            {/each}
          </div>
          {#if tours.some(a => a.sponsored)}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
        {/if}
        <p class="muted small xp-more">{t("xp.more")} <a href={getYourGuideLink(aq)} target="_blank" rel="noopener noreferrer">GetYourGuide ↗</a> · <ViatorLink q={aq} /> · <a href={tiqetsLink(aq)} target="_blank" rel="noopener noreferrer">Tiqets ↗</a></p>
        {#if partner.on && !tours?.some(a => a.sponsored)}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
      {/if}
      <p class="muted small">{t("xp.hint")}</p>
    {/if}
  </div>
</Modal>

<style>
  .xp-places { align-items: center; margin-bottom: 6px; }
  .xp-other { display: flex; gap: 6px; }
  .xp-other input { width: 170px; min-width: 0; }
</style>
