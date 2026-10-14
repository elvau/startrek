<script lang="ts">
  /*
   * Flughafentransfer: vom Ankunftsflughafen (aus den Flügen, sonst dem nächsten großen Flughafen am Ziel) zur
   * Unterkunft (mit Lage) oder in die Ortsmitte. Auswahl Bahn, Bus, Taxi (Richtwert je Fahrt) oder Mietwagen; ein Tipp
   * legt den Posten mit allen Möglichkeiten als Angebote an, die gewählte aktiv. Anbieter und Route zum Vergleichen.
   */
  import { t } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { ageClass, eur } from "../calc";
  import { isActive } from "../model";
  import { hasCoords } from "../geo/maps";
  import { ccOf, findCity, kmBetween } from "../geo/places";
  import { tripSpots } from "../geo/spots";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { arrivals } from "../stays/presence";
  import { GROUND_MAX_KM, homeOf, nearestAirport, routeLink } from "../ground";
  import PartnerLinks from "./PartnerLinks.svelte";
  import { partnersOf } from "../partners";
  import { TRANSFER_ICON, transferItem, transferLegs, transferPlan, vehicleText, type TransferPlan } from "../transfer";
  import { transferChoices, type TransferChoice, type TransferKind } from "../transit";
  import { showItem } from "./showItem";

  let { city, oncar }: { city: string; oncar?: () => void } = $props();

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
  // Fahrpreise Bahn/Bus: Kinder die Hälfte, Kleinkinder frei
  const group = $derived.by(() => {
    const g = { adults: 0, children: 0 };
    for (const x of app.trip.travelers.filter(isActive)) { const c = ageClass(x.age, app.trip.settings, x.kind); if (c === "adult") g.adults++; else if (c === "child") g.children++; }
    if (!g.adults && !g.children) g.adults = 1;
    return g;
  });
  const legs = $derived.by(() => {
    const h = homeOf(app.trip);
    // nahes Ziel ohne Flug (Bahn, Bus, Auto): kein Flughafentransfer
    const ds = dests.filter(d => flying || !h || kmBetween(h, d) > GROUND_MAX_KM);
    const fb = (d: { lat: number; lon: number }) => nearestAirport(airportData, d);
    const ccOfAp = (code: string) => airportData.airports.find(x => x[0] === code)?.[3];
    return transferLegs(ds, tripAps, fb, persons, 1).map(l => {
      const cc = ccOfAp(l.ap.code) || ccOf(geo, app.trip.country);
      const pli = geo.world.find(x => x.k === cc)?.pli;
      const plan = transferPlan(l.ap, l.dest, persons, pli);
      return { ...l, plan, choices: transferChoices(plan.ap, plan.km, group, plan.perRide, pli) };
    });
  });

  function add(plan: TransferPlan, choices: TransferChoice[], pick: TransferKind) {
    setDetailed("transport", true);
    const it = transferItem(plan, choices, pick);
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#each legs as { plan, ap, dest, choices } (plan.ap + "|" + plan.to)}
  <div class="search-row tr-box">
    <p class="tr-head"><span aria-hidden="true">🛬</span> {t("tr.head", { ap: plan.ap, to: plan.to, km: Math.round(plan.km) })}</p>
    <div class="tr-pick" role="group" aria-label={t("tr.pick")}>
      {#each choices as c (c.k)}
        <button type="button" class="tr-c tr-{c.k}" disabled={access.readonly} onclick={() => add(plan, choices, c.k)}
          title={c.line || (c.k === "taxi" ? vehicleText(plan) : t("tr.guess"))}>
          <span class="tr-ic" aria-hidden="true">{TRANSFER_ICON[c.k]}</span>
          <span class="tr-t"><b>{c.k === "taxi" ? vehicleText(plan) : t(`tr.k.${c.k}`)}</b><small>{c.line || (c.guess ? t("tr.guess") : "")}</small></span>
          <span class="tr-p num">≈ {eur(c.perRide)}<small>{t("tr.perRide")}</small></span>
        </button>
      {/each}
      {#if oncar && !access.readonly}
        <button type="button" class="tr-c tr-car" onclick={oncar}>
          <span class="tr-ic" aria-hidden="true">🚗</span><span class="tr-t"><b>{t("tr.k.car")}</b></span>
        </button>
      {/if}
    </div>
  </div>
  <p class="search-row muted small fs-direct tr-links">
    {t("tr.compare")}
    <PartnerLinks ids={partnersOf("transfer")} />
    · <a href={routeLink(`${ap.lat},${ap.lon}`, `${dest.lat},${dest.lon}`, "transit")} target="_blank" rel="noopener noreferrer">{t("tr.routeTransit")} ↗</a>
    · <a href={routeLink(`${ap.lat},${ap.lon}`, `${dest.lat},${dest.lon}`, "driving")} target="_blank" rel="noopener noreferrer">{t("tr.routeCar")} ↗</a>
  </p>
{/each}
