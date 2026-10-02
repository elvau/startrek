<script lang="ts">
  import { locale, t, tn } from "../i18n/index.svelte";
  /*
   * Unterkünfte suchen (wie im Artefakt): Zeitraum und Gäste aus der Anwesenheit (Flüge oder eigene Daten),
   * Booking.com und Trivago gleichzeitig, zusammengeführt nach Preis.
   * Treffer kommen als Angebote in einen Unterkunft-Posten, Preis für den ganzen Aufenthalt.
   */
  import { app } from "../store.svelte";
  import { activeOption, eur, money } from "../calc";
  import { dateDE, dayShort, nights, time } from "../format";
  import Modal from "./Modal.svelte";
  import { showItem } from "./showItem";
  import { dir } from "../directory.svelte";
  import { prefsFor } from "../prefs";
  import { untrack } from "svelte";
  import { stationName } from "../stays/stationName";
  import { FLIGHTS_URL } from "../flights/app";
  import { autoParts, autoRooms, guests, searchStaysRemote, splitGuests, takeStay } from "../stays/app";
  import { arrivals, gaps, guestsIn, hints, stations, stayWindow } from "../stays/presence";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { airportOf, ccOf, cityForAirport, findCity, placesNear, searchParts, stayNear, suggestCities, type CityHit } from "../geo/places";
  import type { StayScope } from "../stays/open.svelte";
  import { STAY_MUSTS, type StayMust, type StayOffer, type StayQuery, type StayType } from "../stays/types";
  import { keepStays, sortStays, type StaySort } from "../stays/sort";
  import { applyStayFilter, kmToCenter, noStayFilter, type StayCtx } from "../stays/filter";
  import StayFilters from "./StayFilters.svelte";
  import { kmText, nearest, tripSpots } from "../geo/spots";
  import type { SourceStatus } from "../flights/types";
  import { airbnbLink, bookingLink } from "../links";
  import { hasCoords, locText, mapsUrl } from "../geo/maps";
  import MapView, { type MapPoint } from "./MapView.svelte";

  let { onclose, scope = {}, inline = false }: { onclose: () => void; scope?: StayScope; inline?: boolean } = $props();

  const K = "rk-stay-search";
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(K) || "{}"); } catch {}

  const trip = app.trip;
  const SOURCES = [{ id: "booking", name: "Booking.com" }, { id: "trivago", name: "Trivago" }, { id: "liteapi", name: "liteAPI" }];
  // Anfangswerte aus dem Aufruf: Posten, Lücke im Plan oder ganze Reise
  const start = (() => ({ ...scope }))();
  const item = start.itemId ? trip.items.find(i => i.id === start.itemId) : undefined;
  const ids = start.ids ?? item?.participants;
  const win = stayWindow(trip, ids);

  // am Posten erneut geöffnet: Ort und Daten der Suche, mit der die Unterkunft gefunden wurde
  const had = item?.options.find(o => o.query)?.query;
  // Rundreise: Stationen aus den Flügen; ohne Vorgabe die erste Lücke (Stadt und Nächte) statt der ganzen Reise
  const sts = stations(trip).filter(s => !ids || s.ids.some(id => ids.includes(id)));
  const firstGap = !start.from && !item && sts.length > 1 ? gaps(trip).find(g => g.ap && (!ids || g.ids.some(id => ids.includes(id)))) : undefined;
  let place = $state(start.place || had?.place || (firstGap ? untrack(() => stationName(geo, airportData, firstGap.ap, firstGap.city)) : "") || trip.place || "");
  let checkin = $state(start.from || item?.from || had?.checkin || firstGap?.from || win?.from || "");
  let checkout = $state(start.to || item?.to || had?.checkout || firstGap?.to || win?.to || "");
  // ohne Stadt im Flug: Name erst, wenn die Ortsdaten geladen sind
  // Name der Station verbessert sich, sobald Flughafen- und Ortsdaten da sind (solange man den Ort nicht selbst geändert hat)
  let auto: string | null = firstGap ? untrack(() => place) : null;
  $effect(() => { void ensureAirports(); });
  $effect(() => {
    if (!firstGap || place !== auto) return;
    const n = stationName(geo, airportData, firstGap.ap, firstGap.city);
    if (n !== place) { place = n; auto = n; }
  });
  function pickStation(s: (typeof sts)[number]) {
    place = stationName(geo, airportData, s.ap, s.city);
    checkin = s.from; checkout = s.to;
  }
  let rooms = $state(1);
  // Vorlieben (Konto und Gruppe) belegen die Art der Unterkunft vor
  const prefs = prefsFor(trip, dir);
  let type = $state<StayType>(prefs.stayType || (["whole", "hotel", "all"] as const).find(t => t === saved.type) || "whole");
  // Ort in einem gesperrten Land: nur Hinweis, suchen darf man trotzdem
  const blocked = $derived.by(() => {
    if (!prefs.avoid?.length || !place.trim()) return "";
    const k = ccOf(geo, searchParts(geo, place.trim(), ccOf(geo, trip.country)).country || "");
    return k && prefs.avoid.includes(k) ? k : "";
  });
  // Ausstattung, Sterne und Bewertung: gemerkt; Sterne und Frühstück aus den Vorlieben, solange nichts gemerkt ist
  let must = $state<StayMust[]>(Array.isArray(saved.must) ? (saved.must as StayMust[]).filter(m => STAY_MUSTS.includes(m))
    : prefs.board && prefs.board !== "self" ? ["breakfast"] : []);
  let minStars = $state<number>(typeof saved.minStars === "number" ? saved.minStars : prefs.minStars || 0);
  let minScore = $state<number>(typeof saved.minScore === "number" ? saved.minScore : 0);
  const MORE = "rk-st-more";
  let more = $state((() => { try { return localStorage.getItem(MORE) === "1"; } catch { return false; } })());
  $effect(() => { const v = more ? "1" : "0"; try { localStorage.setItem(MORE, v); } catch {} });
  const moreSummary = $derived([
    ...must.map(m => t(`st.m.${m}`)),
    minStars ? t("st.starsFrom", { n: minStars }) : "",
    minScore ? t("st.scoreFrom", { n: minScore }) : "",
    SOURCES.filter(s => use.includes(s.id)).map(s => s.name).join(", ")
  ].filter(Boolean).join(" · "));
  const toggleMust = (m: StayMust) => (must = must.includes(m) ? must.filter(x => x !== m) : [...must, m]);
  let use = $state<string[]>(Array.isArray(saved.sources) && (saved.sources as string[]).length ? (saved.sources as string[]) : SOURCES.map(s => s.id));
  const nn = $derived(checkin && checkout ? nights(checkin, checkout) : 0);

  // Wer braucht in diesem Zeitraum ein Bett (laut Flügen), wer nur einen Teil der Nächte
  const who = $derived(nn > 0 ? guestsIn(trip, checkin, checkout, ids) : []);
  const g = $derived(guests(who.map(x => x.t)));
  // große Gruppen: Ferienwohnungen auf mehrere aufteilen, im Hotel ein Zimmer je zwei Gäste (bis man selbst etwas einstellt)
  let parts = $state(1);
  let partsSet = false, roomsSet = false;
  const all = $derived(g.adults + g.childAges.length);
  const per = $derived(splitGuests(g, parts));
  $effect(() => { const p = autoParts(all, type); if (!partsSet) parts = p; });
  $effect(() => { const r = autoRooms(Math.ceil(all / Math.max(1, parts || 1)), type); if (!roomsSet) rooms = r; });
  const partial = $derived(who.filter(x => x.nights < nn));
  const arr = arrivals(trip).filter(a => !ids || a.ids.some(id => ids.includes(id)));

  // wie im Artefakt: Orte am Ankunfts- und Abflughafen als Vorschläge; ohne Reiseziel der Ort am Ankunftsflughafen
  ensureGeo(trip);
  const near = $derived.by(() => {
    const codes = [...new Set(arr.flatMap(a => [a.arrAp, a.depAp]).filter((c): c is string => !!c))];
    return codes.map(c => airportOf(geo, c)).filter(a => !!a).map(ap => ({
      ap: ap!, role: [arr.some(a => a.arrAp === ap!.code) && t("st.landing"), arr.some(a => a.depAp === ap!.code) && t("ie.dep")].filter(Boolean).join(` ${t("and")} `),
      places: placesNear(geo, ap!, 5), city: cityForAirport(geo, ap!)
    }));
  });
  $effect(() => { if (!place && near[0]?.city) place = near[0].city.name; });
  // Stadtsuche im Ort-Feld: Länder der Reise zuerst, dann bekannte Städte weltweit
  let placeFocus = $state(false);
  const prefer = $derived([...new Set([ccOf(geo, trip.country), ...near.map(n => n.ap.cc), ...sts.map(s => airportOf(geo, s.ap)?.cc)].filter((x): x is string => !!x))]);
  const citySugg = $derived(placeFocus ? suggestCities(geo, place, prefer).filter(h => `${h.name}, ${h.land}` !== place.trim() && h.name !== place.trim()) : []);
  function pickCity(h: CityHit) {
    // mit Land, damit die Anbieter die richtige Stadt finden (gleichnamige Orte)
    place = prefer.includes(h.cc) ? h.name : `${h.name}, ${h.land}`;
    placeFocus = false;
  }

  let busy = $state(false);
  let error = $state("");
  let list = $state<StayOffer[] | null>(null);
  let sources = $state<SourceStatus[]>([]);
  let asked = $state<StayQuery | null>(null);
  let askedParts = $state(1);
  let sort = $state<StaySort>("price");
  let taken = $state<Record<string, boolean>>({});
  let into = $state<string | undefined>(item?.id);
  let ctrl: AbortController | undefined;

  // bisheriger Preis des Postens für den ganzen Aufenthalt (zum Vergleichen)
  const current = $derived.by(() => {
    const it = into ? trip.items.find(i => i.id === into) : undefined;
    const o = it && activeOption(it, trip);
    if (!o || o.price.mode !== "unit" || !o.price.unit) return null;
    return { total: o.price.basis === "stay" ? o.price.unit : o.price.unit * (nights(it!.from, it!.to) || 1), url: o.source?.url, name: o.label };
  });
  // dasselbe wie das gewählte Angebot: über den Link, ohne Link über den Namen
  const isCurrent = (o: StayOffer) => !!current && (current.url ? current.url === o.url : current.name === o.name);

  // Filter auf die Treffer (keine neue Anfrage); Entfernung zum Zentrum vom Anbieter oder aus den Koordinaten
  let sfilter = $state(noStayFilter());
  const ctx = $derived<StayCtx>({
    nights: asked ? nights(asked.checkin, asked.checkout) || 1 : 1, people: asked ? asked.adults + asked.childAges.length : 1,
    center: asked ? findCity(geo, asked.place.split(",")[0].trim(), ccOf(geo, asked.country || "")) : null
  });
  const filtered = $derived(applyStayFilter(list || [], sfilter, ctx));
  const shown = $derived(sort === "center"
    ? [...filtered].sort((a, b) => (kmToCenter(a, ctx) ?? Infinity) - (kmToCenter(b, ctx) ?? Infinity) || a.total - b.total)
    : sortStays(filtered, sort));
  // Liste oder Karte (gemerkt); auf der Karte zeigt ein Tipp auf den Preis die Unterkunft darunter
  const VIEW = "rk-st-view";
  let view = $state<"list" | "map">((() => { try { return localStorage.getItem(VIEW) === "map" ? "map" : "list"; } catch { return "list"; } })());
  $effect(() => { const v = view; try { localStorage.setItem(VIEW, v); } catch {} });
  let picked = $state<string | null>(null);
  const located = $derived(shown.filter(hasCoords));
  const points = $derived<MapPoint[]>([
    ...located.map(o => ({ id: o.id, lat: o.lat!, lon: o.lon!, kind: "stay" as const, label: eur(o.total), title: o.name })),
    // Orientierung: Flughäfen der Reise und Erlebnisse mit bekanntem Ort
    ...near.map(n => ({ id: "ap:" + n.ap.code, lat: n.ap.lat, lon: n.ap.lon, kind: "airport" as const, label: `✈ ${n.ap.code}`, title: n.ap.name })),
    ...trip.items.filter(i => i.cat === "attractions" && i.status !== "dropped").flatMap(i => {
      const l = (activeOption(i, trip) || i.options[0])?.loc;
      return hasCoords(l) ? [{ id: "ev:" + i.id, lat: l.lat, lon: l.lon, kind: "event" as const, label: `★ ${i.name.length > 22 ? i.name.slice(0, 21) + "…" : i.name}`, title: i.name }] : [];
    })
  ]);
  // Karte: darunter die Unterkünfte im sichtbaren Ausschnitt, die angetippte zuerst
  let bounds = $state<{ w: number; s: number; e: number; n: number } | null>(null);
  const inView = $derived.by(() => {
    const xs = bounds ? located.filter(o => o.lon! >= bounds!.w && o.lon! <= bounds!.e && o.lat! >= bounds!.s && o.lat! <= bounds!.n) : located;
    const p = picked ? xs.find(o => o.id === picked) ?? located.find(o => o.id === picked) : undefined;
    return p ? [p, ...xs.filter(o => o !== p)] : xs;
  });
  // Entfernungen je Unterkunft: Zentrum, nächster Flughafen der Reise, nächstes Event mit Ort
  const spots = $derived(tripSpots(trip, geo));
  function dist(o: StayOffer): string[] {
    const out: string[] = [];
    const c = kmToCenter(o, ctx);
    if (c != null) out.push(t("sf.toCenter", { d: kmText(c, locale()) }));
    if (hasCoords(o)) {
      const p = { lat: o.lat!, lon: o.lon! };
      const ap = nearest(p, spots, "airport"), ev = nearest(p, spots, "event");
      if (ap) out.push(t("sf.toAirport", { d: kmText(ap.km, locale()), ap: ap.spot.id.slice(3) }));
      if (ev) out.push(t("sf.toEvent", { d: kmText(ev.km, locale()), name: ev.spot.name.length > 24 ? ev.spot.name.slice(0, 23) + "…" : ev.spot.name }));
    }
    return out;
  }
  const mapLink = (o: StayOffer) => mapsUrl({ q: locText(o.name, asked?.place), lat: o.lat, lon: o.lon });
  const hasKm = $derived((list || []).some(o => kmToCenter(o, ctx) != null));
  const toggleSrc = (id: string) => (use = use.includes(id) ? use.filter(x => x !== id) : [...use, id]);
  const score = (s: number) => s.toFixed(1).replace(".", ",");
  const people = (a: number, kids: number[]) => `${a} ${t("age.adultShort")}${kids.length ? `, ${tn("n.kids", kids.length)} (${kids.join(", ")} ${t("st.yearsShort")})` : ""}`;

  async function search(e: Event) {
    e.preventDefault();
    error = ""; list = null; sources = [];
    if (!place.trim()) { error = t("st.errPlace"); return; }
    if (!nn || nn < 1) { error = t("st.errDates"); return; }
    if (!who.length) { error = t("st.errNobody"); return; }
    if (!use.length) { error = t("st.errSource"); return; }
    try { localStorage.setItem(K, JSON.stringify({ type, sources: use.length < SOURCES.length ? use : [], must, minStars, minScore })); } catch {}
    const sp = searchParts(geo, place.trim(), ccOf(geo, trip.country) || near[0]?.ap.cc);
    const cc = ccOf(geo, sp.country || trip.country || "") || near[0]?.ap.cc;
    // Mittelpunkt des Orts: für Anbieter, die im Umkreis suchen
    const city = findCity(geo, sp.place, cc || undefined);
    const q: StayQuery = { place: sp.place, country: sp.country || trip.country || undefined, ...(cc ? { cc } : {}), ...(city ? { lat: city.lat, lon: city.lon } : {}), checkin, checkout, ...per, rooms: Math.max(1, Math.min(rooms, per.adults)), type,
      // Quellen nur bei Auswahl mitschicken (ein älterer Such-Dienst kennt neue Quellen noch nicht)
      ...(use.length < SOURCES.length ? { sources: use } : {}), currency: "EUR",
      ...(must.length ? { must } : {}), ...(minStars ? { minStars } : {}), ...(minScore ? { minScore } : {}) };
    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const r = await searchStaysRemote(q, ctrl.signal);
      // auch hier filtern: ein älterer Such-Dienst kennt Sterne und Bewertung noch nicht
      list = keepStays(r.offers, q).slice(0, 100);
      sfilter = noStayFilter();
      bounds = null;
      sort = q.childAges.length ? "family" : "price";
      picked = null;
      sources = r.sources;
      asked = q;
      askedParts = parts;
    } catch (err) {
      if ((err as Error).name !== "AbortError") error = (err as Error).message;
    } finally { busy = false; }
  }

  function take(o: StayOffer) {
    if (!asked) return;
    // gefundene Unterkünfte rechnen detailliert; weitere Treffer kommen als Angebote in denselben Posten
    app.trip.detail ||= {};
    app.trip.detail.stay = true;
    into = takeStay(app.trip, o, asked, into, ids ?? who.map(x => x.t.id), askedParts).id;
    taken[o.id] = true;
    // Suche schließen und den Posten zeigen; weitere Angebote: Suche am Posten erneut öffnen
    onclose();
    showItem(into);
  }
</script>

{#snippet res(o: StayOffer, an: number, n: number)}
  {@const diff = current && !isCurrent(o) ? o.total - current.total : null}
  <article class="fs-res st-res" class:st-cur={isCurrent(o)} class:st-pick={view === "map" && picked === o.id}>
    {#if o.image}<img class="st-img" src={o.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={e => ((e.currentTarget as HTMLImageElement).hidden = true)} />{/if}
    <div class="st-b">
      <div class="fs-top">
        <b class="st-name">{o.name}</b>
        <span class="fs-badge">{o.sourceName}{o.via && o.via !== o.sourceName ? ` · ${o.via}` : ""}</span>
      </div>
      <div class="fs-top">
        <b class="num fs-price">{eur(o.total)}</b>
        {#if askedParts > 1}<span class="small st-times">× {askedParts} = <b class="num">{eur(o.total * askedParts)}</b></span>{/if}
        {#if o.test}<span class="pill-test" title={t("test.title")}>{t("test.badge")}</span>{/if}
        <span class="muted small">{t("perNight", { v: eur(o.total / an) })}{n > 1 ? ` · ${t("st.ppNight", { v: eur(o.total / an / n) })}` : ""}</span>
        {#if o.orig}<span class="muted small">{t("fx.orig", { v: money(o.orig.amount, o.orig.currency) })}</span>{/if}
        {#if diff != null && Math.abs(diff) >= 1}<span class="st-diff" class:good={diff < 0}>{diff < 0 ? "−" : "+"}{eur(Math.abs(diff))} {t("st.vsCurrent")}</span>{/if}
      </div>
      <div class="fs-pills">
        {#if o.score}<span class="pill-n">{score(o.score)}{o.reviews ? ` (${t("st.reviews", { n: o.reviews.toLocaleString(locale()) })})` : ""}</span>{/if}
        {#if o.stars}<span class="pill-h">{"★".repeat(o.stars)}</span>{/if}
        {#if o.board && o.board !== "self"}<span class="pill-h">{t(`board.${o.board}`)}</span>{/if}
        {#each o.facts || [] as f (f)}<span class="pill-h">{f}</span>{/each}
      </div>
      {#if o.place}<p class="muted small fs-sub">{o.place}</p>{/if}
      {#if dist(o).length}<div class="fs-pills st-dist">{#each dist(o) as d (d)}<span class="pill-h">{d}</span>{/each}</div>{/if}
      <div class="fs-acts">
        {#if !taken[o.id] && isCurrent(o)}<span class="pill-n">{t("st.chosen")}</span>
        {:else}<button class="btn primary sm" disabled={taken[o.id]} onclick={() => take(o)}>{taken[o.id] ? `✓ ${t("search.taken")}` : t("search.take")}</button>{/if}
        {#if o.url}<a class="btn sm" href={o.url} target="_blank" rel="noopener noreferrer">{t("search.atProvider")} ↗</a>{/if}
        {#if mapLink(o)}<a class="btn sm st-gmap" href={mapLink(o)} target="_blank" rel="noopener noreferrer" title={t("map.googleTitle")}>📍 Google Maps ↗</a>{/if}
        <button class="btn sm" disabled title={t("search.bookSoonTitle")}>{t("search.bookHere")} <small>{t("search.soon")}</small></button>
      </div>
    </div>
  </article>
{/snippet}

<Modal title={item ? `${t("st.open")}: ${item.name || t("stay.new")}` : t("st.open")} {onclose} wide {inline}>
  {#if arr.length}
    <div class="st-pres">
      <span class="dlabel">{arr.some(a => a.arr || a.dep) ? t("st.presFlights") : t("st.pres")}</span>
      <ul>
        {#each arr as a (a.ids.join())}
          <li>
            <b>{a.who}</b>
            {#if a.p}
              <span>{t("st.arrDep", { a: a.arr ? `${dayShort(a.arr)} ${time(a.arr)}` : dayShort(a.p.a), d: a.dep ? `${dayShort(a.dep)} ${time(a.dep)}` : dayShort(a.p.d) })} · {tn("n.nights", nights(a.p.a, a.p.d))}{a.p.src === "manual" ? ` (${t("hh.ownDates")})` : ""}</span>
              {#each hints(a) as h (h)}<small class="muted">{h}</small>{/each}
            {:else}
              <span class="muted">{t("st.presOpen")}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <form class="fs-form" onsubmit={search}>
    <div class="ed-row">
      <label class="f grow st-placef">{t("te.place")}<input bind:value={place} placeholder={t("st.placePh")} required autocomplete="off"
          onfocus={() => (placeFocus = true)} onblur={() => setTimeout(() => (placeFocus = false), 150)} oninput={() => (placeFocus = true)} />
        {#if citySugg.length}
          <div class="sugg">{#each citySugg as h (h.cc + h.name)}<button type="button" onmousedown={e => e.preventDefault()} onclick={() => pickCity(h)}>{h.name} <small class="muted">{h.land}</small></button>{/each}</div>
        {/if}
      </label>
      <label class="f">{t("st.checkin")}<input type="date" bind:value={checkin} required /></label>
      <label class="f">{t("st.checkout")}<input type="date" bind:value={checkout} min={checkin} required /></label>
      {#if type !== "hotel" || parts > 1}<label class="f">{t("st.parts")}<input class="n sm st-parts" type="number" min="1" max="10" bind:value={parts} oninput={() => (partsSet = true)} /></label>{/if}
      <label class="f">{t("st.rooms")}<input class="n sm" type="number" min="1" max={Math.min(30, per.adults)} bind:value={rooms} oninput={() => (roomsSet = true)} /></label>
    </div>
    {#if parts > 1}<p class="small st-split-hint">{t("st.split.hint", { all, n: parts, k: per.adults + per.childAges.length })}</p>{/if}
    {#if blocked}<p class="warnline">{t("st.avoided")}</p>{/if}
    {#if sts.length > 1}
      <div class="st-stations">
        <span class="muted small">{t("st.stations")}</span>
        {#each sts as s (s.ap + s.from)}
          {@const nm = stationName(geo, airportData, s.ap, s.city)}
          <button type="button" class="chip sm" class:on={place === nm && checkin === s.from && checkout === s.to} onclick={() => pickStation(s)}>{nm} <small>{dayShort(s.from)}–{dayShort(s.to)} · {tn("n.nights", nights(s.from, s.to))}</small></button>
        {/each}
      </div>
    {/if}
    {#if near.length || trip.place}
      <div class="st-near">
        {#if trip.place}<span class="muted small">{t("st.dest")}</span><button type="button" class="chip sm" class:on={place === trip.place} onclick={() => (place = trip.place)}>{trip.place}</button>{/if}
        {#each near as n (n.ap.code)}
          {#if n.places.length}
            <span class="muted small">{t("st.atAirport", { ap: n.ap.code, role: n.role })}</span>
            {@const sug = stayNear(geo, n.ap)}
            {#each sug && !n.places.some(p => p.name === sug.name) ? [sug, ...n.places] : n.places as p (p.name)}<button type="button" class="chip sm" class:on={place === p.name} onclick={() => (place = p.name)}>{p.name} <small>{Math.round(p.km)} km</small></button>{/each}
          {/if}
        {/each}
      </div>
    {/if}
    <div class="ed-row fs-opts">
      <div class="chips" role="radiogroup" aria-label={t("st.type")}>
        <button type="button" role="radio" aria-checked={type === "whole"} class="chip" class:on={type === "whole"} onclick={() => (type = "whole")}>{t("st.whole")}</button>
        <button type="button" role="radio" aria-checked={type === "hotel"} class="chip" class:on={type === "hotel"} onclick={() => (type = "hotel")}>{t("st.hotel")}</button>
        <button type="button" role="radio" aria-checked={type === "all"} class="chip" class:on={type === "all"} onclick={() => (type = "all")}>{t("all")}</button>
      </div>
    </div>
    <!-- Ausstattung, Sterne, Bewertung, Quellen: zugeklappt mit Zusammenfassung (gemerkt) -->
    <details class="fs-more" bind:open={more}>
      <summary><b>{t("fs.more")}</b> <span class="muted small">{moreSummary}</span></summary>
    <div class="ed-row st-filters">
      <div class="chips" aria-label={t("st.must")}>
        {#each STAY_MUSTS as m (m)}
          <button type="button" class="chip sm" class:on={must.includes(m)} aria-pressed={must.includes(m)} onclick={() => toggleMust(m)}>{t(`st.m.${m}`)}</button>
        {/each}
      </div>
      <label class="f">{t("st.minStars")}
        <select bind:value={minStars}>
          <option value={0}>{t("st.any")}</option>
          {#each [2, 3, 4, 5] as n (n)}<option value={n}>{t("st.starsFrom", { n })}</option>{/each}
        </select>
      </label>
      <label class="f">{t("st.minScore")}
        <select bind:value={minScore}>
          <option value={0}>{t("st.any")}</option>
          {#each [7, 8, 9] as n (n)}<option value={n}>{t("st.scoreFrom", { n })}</option>{/each}
        </select>
      </label>
    </div>
      <div class="chips" aria-label={t("st.sources")}>
        {#each SOURCES as s (s.id)}
          <button type="button" class="chip" class:on={use.includes(s.id)} aria-pressed={use.includes(s.id)} onclick={() => toggleSrc(s.id)}>{s.name}</button>
        {/each}
      </div>
    </details>
    <p class="muted small st-guests">
      {#if nn > 0}{t("range.fromTo", { a: dayShort(checkin), b: dayShort(checkout) })} · {tn("n.nights", nn)} · {/if}
      {#if who.length}<b>{tn("n.guests", who.length)}</b>: {people(g.adults, g.childAges)}{:else}{t("st.nobody")}{/if}
      · {ids ? t("st.fromOnly") : t("st.from")}
      {#if partial.length}<br />{t("stay.partial", { list: partial.map(x => t("st.partialOf", { name: x.t.name, a: x.nights, b: nn })).join(", ") })}{/if}
    </p>
    {#if !FLIGHTS_URL}<p class="warnline small">{t("search.notSetUp")}</p>{/if}
    <button class="btn primary" disabled={busy || !FLIGHTS_URL}>{busy ? t("st.busy", { src: SOURCES.filter(s => use.includes(s.id)).map(s => s.name).join(` ${t("and")} `) }) : t("st.searchBtn")}</button>
    {#if place.trim() && nn > 0}
      {@const lq = { ...searchParts(geo, place.trim(), ccOf(geo, trip.country) || near[0]?.ap.cc), checkin, checkout, ...g, rooms: Math.max(1, Math.min(rooms, g.adults)) }}
      <p class="muted small fs-direct">{t("search.direct")} <a href={bookingLink(lq)} target="_blank" rel="noopener noreferrer">Booking.com ↗</a> · <a href={airbnbLink(lq)} target="_blank" rel="noopener noreferrer">Airbnb ↗</a></p>
    {/if}
  </form>

  {#if error}<p class="err small">{error}</p>{/if}

  {#if list && asked}
    {#if sources.length}
      <div class="fs-src small">
        {#each sources as s (s.id)}
          <span class:ok={s.ok} class:off={!s.configured} title={s.error || ""}>{s.name}{s.test ? ` (${t("test.badge")})` : ""}: {s.ok ? tn("n.hits", s.count) : s.configured ? t("search.error") : t("search.notConfigured")}</span>
        {/each}
      </div>
      {#if sources.some(s => s.test && s.count)}<p class="warnline test-banner">⚠ {t("test.banner", { list: sources.filter(s => s.test && s.count).map(s => s.name).join(", ") })}</p>{/if}
    {/if}
    {#if list.length}
      {@const an = nights(asked.checkin, asked.checkout) || 1}
      {@const n = asked.adults + asked.childAges.length}
      <div class="chips fs-sort" role="radiogroup" aria-label={t("search.sort")}>
        <button type="button" class="chip" class:on={sort === "price"} onclick={() => (sort = "price")}>{t("search.cheapest")}</button>
        <button type="button" class="chip" class:on={sort === "rating"} onclick={() => (sort = "rating")}>{t("st.bestRated")}</button>
        {#if hasKm}<button type="button" class="chip" class:on={sort === "center"} onclick={() => (sort = "center")}>{t("st.nearCenter")}</button>{/if}
        {#if asked.childAges.length}<button type="button" class="chip" class:on={sort === "family"} onclick={() => (sort = "family")}>{t("st.forFamilies")}</button>{/if}
      </div>
      {#if located.length}
        <div class="chips st-view" role="radiogroup" aria-label={t("map.view")}>
          <button type="button" role="radio" aria-checked={view === "list"} class="chip" class:on={view === "list"} onclick={() => (view = "list")}>☰ {t("map.list")}</button>
          <button type="button" role="radio" aria-checked={view === "map"} class="chip" class:on={view === "map"} onclick={() => (view = "map")}>🗺 {t("map.map")}</button>
        </div>
      {/if}
      <StayFilters {list} bind:filter={sfilter} {ctx} />
      <p class="muted small">{filtered.length < list.length ? `${t("fs.f.shown", { n: filtered.length, of: list.length })} · ` : ""}{t("st.summary", { offers: tn("n.offers", list.length), place: asked.place, guests: tn("n.guests", n), people: people(asked.adults, asked.childAges), nights: tn("n.nights", an), d: dateDE(asked.checkin), rooms: asked.rooms, min: eur(Math.min(...list.map(o => o.total))) })}</p>
      {#if view === "map" && located.length}
        <MapView {points} selected={picked} onselect={id => { if (located.some(o => o.id === id)) picked = id; }} onbounds={b => (bounds = b)} />
        <p class="muted small st-maphint">{tn("map.inView", inView.length)}{located.length < shown.length ? ` · ${tn("map.missing", shown.length - located.length)}` : ""} · {t("map.pick")}</p>
        <div class="fs-list">
          {#each inView as o (o.id)}{@render res(o, an, n)}{/each}
        </div>
      {:else}
        <div class="fs-list">
          {#each shown as o (o.id)}{@render res(o, an, n)}{/each}
        </div>
      {/if}
      {#if into}<p class="muted small">{t("st.takenHint", { name: trip.items.find(i => i.id === into)?.name || "" })}</p>{/if}
    {:else}
      <p class="muted small">{t("st.none")}</p>
    {/if}
  {/if}
</Modal>
