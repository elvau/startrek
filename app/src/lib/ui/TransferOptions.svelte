<script lang="ts">
  /*
   * Flughafentransfer: vom Ankunftsflughafen (aus den Flügen, sonst dem nächsten großen Flughafen am Ziel) zur
   * Unterkunft (mit Lage) oder in die Ortsmitte. Richtwert je Fahrt, Posten mit einem Klick, Anbieter zum Vergleichen.
   */
  import { t } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { eur } from "../calc";
  import { isActive } from "../model";
  import { hasCoords } from "../geo/maps";
  import { ccOf, findCity, kmBetween } from "../geo/places";
  import { tripSpots } from "../geo/spots";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { arrivals } from "../stays/presence";
  import { GROUND_MAX_KM, homeOf, nearestAirport, routeLink } from "../ground";
  import PartnerLinks from "./PartnerLinks.svelte";
  import { partnersOf } from "../partners";
  import { transferItem, transferLegs, transferPlan, vehicleText, type TransferPlan } from "../transfer";
  import { showItem } from "./showItem";

  let { city }: { city: string } = $props();

  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });

  // Ziele: jede Unterkunft mit Lage; sonst Veranstaltung bzw. Ortsmitte
  const dests = $derived.by(() => {
    void Object.keys(geo.places).length;
    const stays = tripSpots(app.trip, geo).filter(s => s.kind === "stay").map(s => ({ name: s.name, lat: s.lat, lon: s.lon }));
    if (stays.length) return stays;
    const ev = app.trip.event;
    if (ev && hasCoords(ev)) return [{ name: city || ev.name, lat: ev.lat!, lon: ev.lon! }];
    const c = city ? findCity(geo, city, ccOf(geo, app.trip.country)) || findCity(geo, city) : null;
    return c ? [{ name: city, lat: c.lat, lon: c.lon }] : [];
  });
  const flying = $derived(app.trip.items.some(i => i.cat === "flights" && i.status !== "dropped"));
  // Flughäfen der Reise (Anreise und Abreise aller Gruppen)
  const tripAps = $derived.by(() => {
    const codes = new Set(arrivals(app.trip).flatMap(a => [a.arrAp, a.depAp]).filter((c): c is string => !!c));
    return airportData.airports.filter(x => codes.has(x[0])).map(a => ({ code: a[0], lat: a[4], lon: a[5] }));
  });
  const persons = $derived(app.trip.travelers.filter(isActive).length);
  const legs = $derived.by(() => {
    const h = homeOf(app.trip);
    // nahes Ziel ohne Flug (Bahn, Bus, Auto): kein Flughafentransfer
    const ds = dests.filter(d => flying || !h || kmBetween(h, d) > GROUND_MAX_KM);
    const fb = (d: { lat: number; lon: number }) => nearestAirport(airportData, d);
    const ccOfAp = (code: string) => airportData.airports.find(x => x[0] === code)?.[3];
    return transferLegs(ds, tripAps, fb, persons, 1).map(l => {
      const cc = ccOfAp(l.ap.code) || ccOf(geo, app.trip.country);
      return { ...l, plan: transferPlan(l.ap, l.dest, persons, geo.world.find(x => x.k === cc)?.pli) };
    });
  });

  function add(plan: TransferPlan) {
    setDetailed("transport", true);
    const it = transferItem(plan);
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#each legs as { plan, ap, dest } (plan.ap + "|" + plan.to)}
  {#if !access.readonly}<div class="search-row"><button class="btn tr-add" onclick={() => add(plan)}>🚐 {t("tr.add")}{legs.length > 1 ? ` (${plan.ap} → ${plan.to})` : ""}</button></div>{/if}
  <p class="search-row muted small fs-direct tr-links">
    {t("tr.info", { ap: plan.ap, to: plan.to, km: Math.round(plan.km), v: vehicleText(plan), p: eur(plan.perRide) })}<br />
    {t("tr.compare")}
    <PartnerLinks ids={partnersOf("transfer")} />
    · <a href={routeLink(`${ap.lat},${ap.lon}`, `${dest.lat},${dest.lon}`, "driving")} target="_blank" rel="noopener noreferrer">{t("tr.route")} ↗</a>
  </p>
{/each}
