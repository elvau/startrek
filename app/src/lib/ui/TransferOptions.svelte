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
  import { transferItem, transferPlan, vehicleText } from "../transfer";
  import { showItem } from "./showItem";

  let { city }: { city: string } = $props();

  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });

  const dest = $derived.by(() => {
    void Object.keys(geo.places).length;
    const stay = tripSpots(app.trip, geo).find(s => s.kind === "stay");
    if (stay) return { name: stay.name, lat: stay.lat, lon: stay.lon };
    const ev = app.trip.event;
    if (ev && hasCoords(ev)) return { name: city || ev.name, lat: ev.lat!, lon: ev.lon! };
    const c = city ? findCity(geo, city, ccOf(geo, app.trip.country)) || findCity(geo, city) : null;
    return c ? { name: city, lat: c.lat, lon: c.lon } : null;
  });
  const flying = $derived(app.trip.items.some(i => i.cat === "flights" && i.status !== "dropped"));
  const ap = $derived.by(() => {
    if (!dest) return null;
    const code = arrivals(app.trip).find(a => a.arrAp)?.arrAp;
    const a = code && airportData.airports.find(x => x[0] === code);
    if (a) return { code: a[0], lat: a[4], lon: a[5], cc: a[3] };
    const n = nearestAirport(airportData, dest);
    return n ? { ...n, cc: airportData.airports.find(x => x[0] === n.code)?.[3] } : null;
  });
  // nahes Ziel ohne Flug (Bahn, Bus, Auto): kein Flughafentransfer
  const near = $derived.by(() => { const h = homeOf(app.trip); return !flying && !!h && !!dest && kmBetween(h, dest) <= GROUND_MAX_KM; });
  const persons = $derived(app.trip.travelers.filter(isActive).length);
  const plan = $derived.by(() => {
    if (!ap || !dest || near || kmBetween(ap, dest) > 150) return null;
    const cc = ccOf(geo, app.trip.country) || ap.cc;
    return transferPlan(ap, dest, persons, geo.world.find(x => x.k === cc)?.pli);
  });

  function add() {
    if (!plan) return;
    setDetailed("transport", true);
    const it = transferItem(plan);
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#if plan && ap && dest}
  {#if !access.readonly}<div class="search-row"><button class="btn tr-add" onclick={add}>🚐 {t("tr.add")}</button></div>{/if}
  <p class="search-row muted small fs-direct tr-links">
    {t("tr.info", { ap: plan.ap, to: plan.to, km: Math.round(plan.km), v: vehicleText(plan), p: eur(plan.perRide) })}<br />
    {t("tr.compare")}
    <PartnerLinks ids={partnersOf("transfer")} />
    · <a href={routeLink(`${ap.lat},${ap.lon}`, `${dest.lat},${dest.lon}`, "driving")} target="_blank" rel="noopener noreferrer">{t("tr.route")} ↗</a>
  </p>
{/if}
