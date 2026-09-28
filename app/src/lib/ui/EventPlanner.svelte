<script lang="ts">
  import { arrow, t, tn, type Key } from "../i18n/index.svelte";
  /*
   * Reise zu einem Event: Was, wo, wann. Daraus bis zu drei Vorschläge (ohne Nacht, eine Nacht, ab Vortag),
   * je mit dem günstigsten passenden Flug (inkl. Anfahrt) und einer gut bewerteten Unterkunft.
   */
  import { app } from "../store.svelte";
  import { eur } from "../calc";
  import { dayShort, range, time } from "../format";
  import Modal from "./Modal.svelte";
  import LocationPicker from "./LocationPicker.svelte";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, findCity, searchParts } from "../geo/places";
  import { areaAround, countryName, locOf, resolveLoc, searchLocs, type Loc } from "../geo/locations";
  import { FLIGHTS_URL, flyers, nearestAirports, passengers, rate, searchFlights, type Rated } from "../flights/app";
  import { guests, searchStaysRemote } from "../stays/app";
  import { DEFAULT_H, fits, pickStay, takePlan, variants, type Variant } from "../event/plan";
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

  const aps = nearestAirports(trip);
  const people = flyers(trip);
  const cc = $derived(ccOf(geo, trip.country));

  /** Ziel als Auswahl: Stadt oder Flughafen aus der Liste, sonst alle Flughäfen im Umkreis des Ortes */
  function destOf(text: string): Loc | null {
    if (loc) return loc;
    const n = text.split(",")[0].trim();
    if (!n) return null;
    const hit = resolveLoc(airportData, n, cc);
    if (hit) return hit;
    const c = findCity(geo, n, cc) || findCity(geo, n);
    if (c) return areaAround(airportData, { name: c.name, lat: c.lat, lon: c.lon, cc: c.cc });
    const s = searchLocs(airportData, n, 1)[0];
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
    if (!FLIGHTS_URL) { error = t("search.notReady"); return; }
    await Promise.all([ensureGeo(trip), ensureAirports()]);
    const dest = destOf(place);
    if (!dest) { error = t("ev.errPlace", { q: place.trim() }); return; }
    const city = dest.kind === "airport" ? dest.city : (loc?.city || place.split(",")[0].trim());

    // Anlass und Ort in der Reise merken; der Name folgt dem Anlass, solange man keinen eigenen vergeben hat
    const ev = { name: name.trim(), start: `${date}T${clock}`, hours: Number(hours) || DEFAULT_H, ...(venue.trim() ? { venue: venue.trim() } : {}) };
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
        const flights = fl.status === "fulfilled" ? fl.value.offers.filter(o => fits(o, v)).map(o => rate(trip, o, o.out.from, true)) : [];
        const flight = flights.length ? flights.reduce((a, b) => (b.total < a.total ? b : a)) : null;
        const stay = st.status === "fulfilled" && st.value ? pickStay(st.value.offers) : null;
        const error = fl.status === "rejected" ? (fl.reason as Error).message : undefined;
        return { v, flight, stay, stayQ: v.nights ? q : null, total: (flight?.total || 0) + (stay ? Math.round(stay.total) : 0), error };
      }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") error = (err as Error).message;
    } finally { busy = false; }
  }

  function take(r: Row) {
    takePlan(app.trip, r.v, r.flight, r.stay, r.stayQ);
    done = true;
    rows = null;
  }

  const n = people.length || 1;
  const found = $derived(rows?.filter(r => r.flight) ?? []);
  const cheapest = $derived(found.length ? Math.min(...found.map(r => r.total)) : null);
  const mapLink = $derived(venue.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.trim()}, ${place.split(",")[0].trim()}`)}` : "");
</script>

<Modal title={t("ev.title")} {onclose} wide>
  <p class="muted">{t("ev.lead")}</p>
  <form class="fs-form ev-form" onsubmit={go}>
    <div class="ed-row">
      <label class="f ev-grow">{t("ev.name")}<input bind:value={name} placeholder={t("ev.namePh")} required /></label>
    </div>
    <div class="ed-row">
      <LocationPicker label={t("ev.city")} bind:value={loc} bind:text={place} placeholder={t("ev.cityPh")} required />
      <label class="f ev-grow">{t("ev.venue")}<input bind:value={venue} placeholder={t("ev.venuePh")} /></label>
    </div>
    <div class="ed-row">
      <label class="f">{t("ev.date")}<input type="date" bind:value={date} required /></label>
      <label class="f">{t("ev.start")}<input type="time" bind:value={clock} required /></label>
      <label class="f">{t("ev.hours")}<input class="n sm" type="number" min="1" max="24" step="0.5" bind:value={hours} /></label>
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
              <p class="ev-line">🛏 {r.stay.name}{r.stay.score ? ` · ${r.stay.score.toFixed(1)}` : ""} <small class="muted">{eur(Math.round(r.stay.total))}{r.stay.place ? ` · ${r.stay.place}` : ""}</small></p>
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
    {#if mapLink}<p class="muted small"><a href={mapLink} target="_blank" rel="noopener noreferrer">{t("ev.map", { venue: venue.trim() })} ↗</a></p>{/if}
  {/if}
</Modal>
