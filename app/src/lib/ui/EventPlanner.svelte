<script lang="ts">
  import { netMessage, showError } from "../neterror";
  import { arrow, locale, t, tn, type Key } from "../i18n/index.svelte";
  /*
   * Reise zu einem Event: Was, wo, wann. Daraus bis zu drei Vorschläge (ohne Nacht, eine Nacht, ab Vortag),
   * je mit dem günstigsten passenden Flug (inkl. Anfahrt) und einer gut bewerteten Unterkunft.
   */
  import { app, startTrip, switchTrip } from "../store.svelte";
  import { eur } from "../calc";
  import { dayShort, range, time } from "../format";
  import Modal from "./Modal.svelte";
  import { untrack } from "svelte";
  import HomeHint from "./HomeHint.svelte";
  import { loadOrigin } from "../flights/origin.svelte";
  import LocationPicker from "./LocationPicker.svelte";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { capitalOf, ccOf, findCity, loadGeo, searchParts } from "../geo/places";
  import { areaAround, countryName, destAround, locLabel, locOf, resolveLoc, searchLocs, type Loc } from "../geo/locations";
  import { loadPlz } from "../plz";
  import { hhKey } from "../model";
  import { FLIGHTS_URL, flyers, homeGuess, nearestAirports, passengers, rate, searchFlights, worthRetry, type Rated } from "../flights/app";
  import { guests, searchStaysRemote } from "../stays/app";
  import { DEFAULT_H, fits, km, pickStayNear, takePlan, variants, type Variant } from "../event/plan";
  import { cityFromAddress, evWhen, searchEventsRemote, sportTag, SPORT_ICON } from "../events/app";
  import { uniqueById } from "../events/search";
  import { noteError } from "../bugs/log";
  import type { EventHit } from "../events/types";
  import type { StayOffer, StayQuery } from "../stays/types";

  let { onclose }: { onclose: () => void } = $props();

  const trip = app.trip;
  const ev0 = trip.event;
  let name = $state(ev0?.name || "");
  let venue = $state(ev0?.venue || "");
  let place = $state(trip.place || "");
  let loc = $state<Loc | null>(null);
  let date = $state(ev0?.start.slice(0, 10) || "");
  let clock = $state(ev0?.start.slice(11, 16) || "18:00");
  let hours = $state(ev0?.hours || DEFAULT_H);
  void Promise.all([ensureGeo(trip), ensureAirports()]);

  // Event suchen: Treffer füllt Name, Ort, Stadion, Datum und Uhrzeit aus
  let eq = $state("");
  let evBusy = $state(false);
  let evErr = $state("");
  let hits = $state<EventHit[] | null>(null);
  let picked = $state<EventHit | null>(null);
  /** angenommene Stadt (Hauptstadt), solange man sie nicht ändert */
  let guess = $state("");
  // Sportkalender: Sportart antippen statt Stichwort
  const SPORT_CHIPS = ["multi", "join", "run", "tri", "bike", "ski", "tennis", "motor", "golf", "team"];
  let sport = $state("");
  function findSport(s: string) {
    sport = sport === s ? "" : s;
    if (sport) { eq = ""; void find(); } else hits = null;
  }
  async function find(e?: Event) {
    e?.preventDefault();
    evErr = ""; hits = null;
    if (e) sport = "";
    if (!sport && eq.trim().length < 2) return;
    evBusy = true;
    try {
      const res = await searchEventsRemote(sport ? { q: "", sport } : { q: eq.trim() });
      if (!res.sources.some(s => s.configured)) { evErr = t("evs.notReady"); return; }
      hits = uniqueById(res.events || []);
      if (!hits.length && res.sources.every(s => !s.ok)) {
        evErr = showError(res.sources.find(s => s.error)?.error) || t("evs.none");
        noteError(`Event-Suche: ${res.sources.map(s => `${s.id} ${s.error || (s.ok ? "ok" : "aus")}`).join(", ")}`);
      }
    } catch (err) { evErr = netMessage(err); noteError(`Event-Suche: ${evErr}`); }
    finally { evBusy = false; }
  }
  async function pick(h: EventHit) {
    picked = h; hits = null;
    name = h.name;
    date = h.start.slice(0, 10);
    if (h.start.length > 10) clock = h.start.slice(11, 16);
    venue = h.venue || "";
    loc = null;
    evNear = [];
    guess = "";
    place = h.city || "";
    // Stadt aus der Anschrift: Flughafenliste und die Orte des Landes (für Städte ohne Flughafen, z. B. Mönchengladbach)
    if (!h.city && h.address) {
      await Promise.all([ensureAirports(), h.cc ? loadGeo(geo, [h.cc]) : null]);
      if (picked !== h) return;
      if (!place) place = cityFromAddress(airportData, h.address, h.cc, geo) || "";
    }
    // nur das Land bekannt (z. B. Champions League gegen Sabah FK): Hauptstadt annehmen, mit Hinweis zum Prüfen
    if (!place && h.cc) {
      await loadGeo(geo, [h.cc]);
      if (picked !== h) return;
      const cap = capitalOf(geo, h.cc);
      if (cap) { place = cap.name; guess = cap.name; }
    }
    // Ziel aus der Lage des Stadions: Flughäfen im Umkreis (gleichnamige Städte woanders spielen keine Rolle);
    // beim Antippen des Felds stehen sie zur Auswahl, falls man lieber einen bestimmten anfliegt
    if (h.lat == null || h.lon == null) return;
    await ensureAirports();
    if (picked !== h) return;
    const p = { name: place.split(",")[0].trim() || h.venue || h.name, lat: h.lat, lon: h.lon, cc: h.cc };
    const { best, options } = destAround(airportData, p);
    evNear = options;
    if (best) { loc = best; place = locLabel(best); }
  }

  // Abflughäfen: vorausgewählt die nächsten zu den Wohnorten, an- und abwählbar, weitere hinzufügen
  const aps0 = nearestAirports(trip);
  let aps = $state<string[]>(aps0);
  let allCodes = $state<string[]>([...aps0]);
  // ohne Wohnort: PLZ gleich hier (sonst Flughäfen aus NRW und keine Anfahrt)
  const noHome = $derived(flyers(trip).some(x => !trip.households?.[hhKey(x)]?.geo));
  let plzErr = $state(false);
  async function setPlz(v: string) {
    plzErr = false;
    if (!/^\d{5}$/.test(v.trim())) return;
    const pl = (await loadPlz().catch(() => null))?.get(v.trim());
    if (!pl) { plzErr = true; return; }
    trip.households ||= {};
    for (const h of new Set(flyers(trip).map(hhKey))) if (!trip.households[h]?.geo) trip.households[h] = { ...trip.households[h], plz: v.trim(), geo: { lat: pl.lat, lon: pl.lon, ort: pl.ort } };
    aps = nearestAirports(trip); allCodes = [...new Set([...aps, ...allCodes])];
  }
  // ohne Wohnort: ungefährer Ort aus der Verbindung kommt nach; Vorschlag nachziehen, solange nichts selbst gewählt ist
  let apsTouched = false;
  loadOrigin();
  $effect(() => { if (homeGuess(4) && noHome) untrack(() => { if (!apsTouched) { aps = nearestAirports(trip); allCodes = [...new Set([...aps, ...allCodes])]; } }); });
  const toggleAp = (c: string) => { apsTouched = true; aps = aps.includes(c) ? aps.filter(x => x !== c) : [...aps, c]; };
  function addAp(l: Loc) {
    apsTouched = true;
    for (const c of l.kind === "airport" ? [l.code] : l.airports) {
      if (!allCodes.includes(c)) allCodes = [...allCodes, c];
      if (!aps.includes(c)) aps = [...aps, c];
    }
  }
  // Mittelpunkt der Abflughäfen: gleich gute Treffer beim Ziel nach Entfernung
  const fromPt = $derived.by(() => {
    const ps = aps.map(c => locOf(airportData, c, "airport")).filter((l): l is Loc => l?.lat != null && l.lon != null);
    return ps.length ? { lat: ps.reduce((v, l) => v + l.lat!, 0) / ps.length, lon: ps.reduce((v, l) => v + l.lon!, 0) / ps.length } : null;
  });
  /** Flughäfen rund um das gewählte Event (Vorschläge im Zielfeld) */
  let evNear = $state<Loc[]>([]);
  const people = flyers(trip);
  // Land: das des gewählten Events, sonst das der Reise
  const cc = $derived(picked?.cc || ccOf(geo, trip.country));

  /** Ziel als Auswahl: Stadt oder Flughafen aus der Liste, sonst alle Flughäfen im Umkreis des Ortes */
  function destOf(text: string): Loc | null {
    if (loc) return loc;
    const n = text.split(",")[0].trim();
    if (!n) return null;
    const hit = resolveLoc(airportData, n, cc);
    if (hit) return hit;
    const c = findCity(geo, n, cc) || findCity(geo, n);
    if (c) return areaAround(airportData, { name: c.name, lat: c.lat, lon: c.lon, cc: c.cc });
    const s = searchLocs(airportData, n, 1, fromPt)[0];
    const ap = s && (s.lat != null ? s : locOf(airportData, s.airports[0], "airport"));
    return ap?.lat != null ? areaAround(airportData, { name: s.city, lat: ap.lat, lon: ap.lon!, cc: s.cc }) : null;
  }

  interface Row { v: Variant; flight: Rated | null; stay: StayOffer | null; stayQ: StayQuery | null; total: number; error?: string }
  let rows = $state<Row[] | null>(null);
  let busy = $state(false);
  let error = $state("");
  let done = $state(false);
  let ctrl: AbortController | undefined;

  async function go(e: Event) {
    e.preventDefault();
    error = ""; rows = null; done = false;
    if (!name.trim() || !place.trim() || !date || !/^\d{2}:\d{2}$/.test(clock)) { error = t("ev.errFields"); return; }
    if (!aps.length) { error = t("fs.errAirport"); return; }
    if (!FLIGHTS_URL) { error = t("search.notReady"); return; }
    await Promise.all([ensureGeo(trip), ensureAirports()]);
    const dest = destOf(place);
    if (!dest) { error = t("ev.errPlace", { q: place.trim() }); return; }
    const city = dest.kind === "airport" ? dest.city : (loc?.city || place.split(",")[0].trim());

    // Anlass und Ort in der Reise merken; der Name folgt dem Anlass, solange man keinen eigenen vergeben hat
    const same = picked && picked.name === name.trim() && picked.start.slice(0, 10) === date;
    const ev = {
      name: name.trim(), start: `${date}T${clock}`, hours: Number(hours) || DEFAULT_H, ...(venue.trim() ? { venue: venue.trim() } : {}),
      ...(same && picked!.lat != null ? { lat: picked!.lat, lon: picked!.lon } : {}), ...(same && picked!.url ? { url: picked!.url } : {})
    };
    trip.event = ev;
    if (trip.place !== city) { trip.place = city; if (dest.cc) trip.country = countryName(dest.cc); }
    if (trip.autoName !== false) { trip.name = ev.name; trip.autoName = false; }

    const list = variants(ev);
    const pax = passengers(trip);
    const g = guests(people);
    const sp = searchParts(geo, city, ccOf(geo, trip.country) || dest.cc);
    const stayQ = (v: Variant): StayQuery => ({ place: sp.place, country: sp.country, checkin: v.out, checkout: v.back, ...g, rooms: Math.max(1, Math.ceil(g.adults / 2)), type: "all", currency: "EUR" });
    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    const signal = ctrl.signal;
    try {
      rows = await Promise.all(list.map(async (v): Promise<Row> => {
        const q = stayQ(v);
        const [fl, st] = await Promise.allSettled([
          searchFlights({
            from: aps[0], fromAirports: aps, to: dest.code, toAirports: dest.airports, ...(dest.kind === "city" ? { toCityCode: dest.code } : {}),
            depart: v.out, ret: v.back, maxStops: 1, bags: false, selfTransfer: false, ...pax, currency: "EUR"
          }, signal),
          v.nights ? searchStaysRemote(q, signal) : Promise.resolve(null)
        ]);
        const flights = fl.status === "fulfilled" ? fl.value.offers.filter(o => !o.test && fits(o, v)).map(o => rate(trip, o, o.out.from, true)) : [];
        const flight = flights.length ? flights.reduce((a, b) => (b.total < a.total ? b : a)) : null;
        const stay = st.status === "fulfilled" && st.value ? pickStayNear(st.value.offers.filter(o => !o.test), ev) : null;
        // Quelle auch nach dem zweiten Versuch ohne Antwort: nicht als „kein Flug“ ausgeben
        const error = fl.status === "rejected" ? netMessage(fl.reason) : worthRetry(fl.value) ? t("ev.flightsDown") : undefined;
        return { v, flight, stay, stayQ: v.nights ? q : null, total: (flight?.total || 0) + (stay ? Math.round(stay.total) : 0), error };
      }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") error = netMessage(err);
    } finally { busy = false; }
  }

  function take(r: Row) {
    // in die Reise, für die der Planer geöffnet wurde; wurde inzwischen eine andere geöffnet, zurück (oder neu, falls weg)
    if (app.trip.id !== trip.id) { switchTrip(trip.id, "Event-Planer"); if (app.trip.id !== trip.id) startTrip(); }
    takePlan(app.trip, r.v, r.flight, r.stay, r.stayQ);
    done = true;
    rows = null;
  }

  const n = people.length || 1;
  const found = $derived(rows?.filter(r => r.flight) ?? []);
  const cheapest = $derived(found.length ? Math.min(...found.map(r => r.total)) : null);
  const at = $derived(trip.event?.lat != null ? { lat: trip.event.lat, lon: trip.event.lon! } : null);
  const dist = (o: StayOffer) => (at && o.lat != null && o.lon != null ? km(at, { lat: o.lat, lon: o.lon }) : null);
  const mapLink = $derived(venue.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.trim()}, ${place.split(",")[0].trim()}`)}` : "");
</script>

<Modal title={t("ev.title")} {onclose} wide>
  <p class="muted">{t("ev.lead")}</p>
  <form class="ev-find" onsubmit={find}>
    <label class="f ev-grow">{t("evs.label")}<input type="search" enterkeyhint="search" bind:value={eq} placeholder={t("evs.ph")} /></label>
    <button class="btn" disabled={evBusy}>{evBusy ? t("evs.busy") : t("evs.go")}</button>
  </form>
  <div class="chips ev-sports" aria-label={t("sp.title")}>
    <span class="muted small">{t("sp.title")}</span>
    {#each SPORT_CHIPS as s (s)}<button type="button" class="chip sm" class:on={sport === s} aria-pressed={sport === s} onclick={() => findSport(s)}>{SPORT_ICON[s]} {t(`sp.${s}` as Key)}</button>{/each}
  </div>
  {#if evErr}<p class="warnline">{evErr}</p>{/if}
  {#if hits}
    {#if !hits.length}<p class="muted small">{t("evs.none")}</p>{/if}
    <div class="ev-hits">
      {#each hits as h (h.id)}
        <button type="button" class="ev-hit" onclick={() => pick(h)}>
          <b>{h.name}</b>
          <span class="muted small">{evWhen(h)}{h.venue ? ` · ${h.venue}` : ""}{h.city ? `, ${h.city}` : ""}{h.category ? ` · ${h.category}` : ""}</span>
          {#if h.sport}<span class="small ev-sport">{sportTag(h)}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
  <p class="muted small ev-or">{t("evs.or")}</p>
  <form class="fs-form ev-form" onsubmit={go}>
    <div class="ed-row">
      <label class="f ev-grow">{t("ev.name")}<input bind:value={name} placeholder={t("ev.namePh")} required /></label>
    </div>
    <div class="ed-row">
      <LocationPicker label={t("ev.city")} bind:value={loc} bind:text={place} placeholder={t("ev.cityPh")} required near={evNear} from={fromPt} />
      <label class="f ev-grow">{t("ev.venue")}<input bind:value={venue} placeholder={t("ev.venuePh")} /></label>
    </div>
    {#if guess && place === guess}<p class="warnline small ev-guess">{t("ev.cityGuess", { city: guess })}</p>{/if}
    <div class="ed-row">
      <label class="f">{t("ev.date")}<input type="date" bind:value={date} required /></label>
      <label class="f">{t("ev.start")}<input type="time" bind:value={clock} required /></label>
      <label class="f">{t("ev.hours")}<input class="n sm" type="number" min="1" max="24" step="0.5" bind:value={hours} /></label>
    </div>
    <div>
      <span class="dlabel">{t("ev.origins")}</span>
      <div class="chips fs-aps">
        {#each allCodes as c (c)}<button type="button" class="chip" class:on={aps.includes(c)} aria-pressed={aps.includes(c)} onclick={() => toggleAp(c)}>{c}</button>{/each}
        <LocationPicker cls="fs-add" placeholder={t("fs.addOrigin")} clearOnPick onpick={addAp} from={fromPt} />
      </div>
      {#if noHome}<HomeHint {setPlz} {plzErr} />{/if}
    </div>
    <p class="muted small">{t("ev.from", { aps: aps.join(", "), p: tn("n.persons", people.length) })} {t("ev.rule")}</p>
    <button class="btn primary" disabled={busy}>{busy ? t("ev.progress") : t("ev.go")}</button>
    {#if error}<p class="warnline">{error}</p>{/if}
  </form>

  {#if done}
    <p class="ev-done">✓ {t("ev.taken")}</p>
  {/if}

  {#if rows}
    {#if !found.length}<p class="warnline">{t("ev.none")}</p>{/if}
    <div class="ev-list">
      {#each rows as r (r.v.kind)}
        {@const f = r.flight}
        <article class="ev-card" class:best={f && r.total === cheapest}>
          <header>
            <b>{t(`ev.v.${r.v.kind}` as Key)}</b>
            <span class="muted small">{r.v.nights ? `${range(r.v.out, r.v.back)} · ${tn("n.nights", r.v.nights)}` : dayShort(r.v.out)}</span>
          </header>
          {#if f}
            <p class="ev-line">✈ {f.out.from} {time(f.out.dep)} {arrow()} {f.out.to} {time(f.out.arr)}{#if f.back}{" · "}{t("ev.back")} {dayShort(f.back.dep)} {time(f.back.dep)} {arrow()} {time(f.back.arr)}{/if}
              <small class="muted">{f.out.carriers.join(" / ")} · {eur(f.price)}{f.access ? ` · ${t("fl.inclAccess", { v: eur(f.access) })}` : ""}</small></p>
          {:else}
            <p class="ev-line muted">✈ {r.error || t("ev.noFlight")}</p>
          {/if}
          {#if r.v.nights}
            {#if r.stay}
              {@const d = dist(r.stay)}
              <p class="ev-line">🛏 {r.stay.name}{r.stay.score ? ` · ${r.stay.score.toFixed(1)}` : ""} <small class="muted">{eur(Math.round(r.stay.total))}{d != null ? ` · ${t("evs.km", { n: new Intl.NumberFormat(locale(), { maximumFractionDigits: d < 10 ? 1 : 0 }).format(d) })}` : r.stay.place ? ` · ${r.stay.place}` : ""}</small></p>
            {:else}
              <p class="ev-line muted">🛏 {t("ev.noStay")}</p>
            {/if}
          {:else}
            <p class="ev-line muted">🛏 {t("ev.noNight")}</p>
          {/if}
          <footer>
            {#if f}
              <span><b class="num">{eur(r.total)}</b>{#if n > 1} <small class="muted">{t("perPerson", { v: eur(r.total / n) })}</small>{/if}</span>
              <button class="btn sm primary" onclick={() => take(r)}>{t("ev.take")}</button>
            {/if}
          </footer>
        </article>
      {/each}
    </div>
    {#if mapLink || trip.event?.url}<p class="muted small">
      {#if mapLink}<a href={mapLink} target="_blank" rel="noopener noreferrer">{t("ev.map", { venue: venue.trim() })} ↗</a>{/if}
      {#if trip.event?.url}{mapLink ? " · " : ""}<a class="ev-tickets" href={trip.event.url} target="_blank" rel="noopener noreferrer">{t("evs.tickets")} ↗</a>{/if}
    </p>{/if}
  {/if}
</Modal>
