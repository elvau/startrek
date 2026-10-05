<script lang="ts">
  /*
   * Anreise mit dem eigenen Auto als Posten (je Auto einer): Sprit hin und zurück, dazu Vignetten und Maut auf der Strecke
   * als Nebenkosten (#170). Wer zahlt, bestimmt „Wer ist dabei“ am Posten: die Mitfahrenden teilen, oder nur der Fahrer.
   * Ohne Auto-Posten (Bahn, Bus) gibt es keine Vignette.
   */
  import { t, tn } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { eur, moneyExact, rateOf } from "../calc";
  import { isActive, uid, type Item } from "../model";
  import { FEES_AS_OF, TOLLS, roadCosts, roadExtras, routeCountries } from "../fees";
  import { countryName } from "../geo/locations";
  import { ccOf, findCity, kmBetween } from "../geo/places";
  import { geo } from "../geo/geo.svelte";
  import { homeOf } from "../ground";
  import { flagOf } from "../format";
  import { imp } from "../importantState.svelte";
  import { showItem } from "./showItem";

  let { city }: { city: string } = $props();
  const KEY = "road:car";
  const home = $derived(homeOf(app.trip));
  const dest = $derived.by(() => {
    void Object.keys(geo.places).length;
    const c = city ? findCity(geo, city, ccOf(geo, app.trip.country)) || findCity(geo, city) : null;
    return c ? { name: city, lat: c.lat, lon: c.lon } : null;
  });
  const flies = $derived(app.trip.items.some(i => i.cat === "flights" && i.status !== "dropped"));
  const destCc = $derived(imp.countries[0] || ccOf(geo, app.trip.country) || "");
  // Wohnort: Postleitzahlen gibt es bisher für Deutschland
  const route = $derived(home && destCc ? routeCountries("DE", destCc) : []);
  const rc = $derived(roadCosts(route));
  const road = $derived(home && dest ? Math.round(kmBetween(home, dest) * 1.3) : 0);
  const kmCost = $derived(app.trip.settings.kmCost ?? 0.3);
  const rate = (c: string) => rateOf(c, app.trip.settings);
  const extras = $derived(roadExtras(route, road, rate));
  const fuel = $derived(Math.round(2 * road * kmCost));
  const perCar = $derived(fuel + extras.reduce((s, x) => s + x.amount, 0));
  const cars = $derived(app.trip.items.filter(i => i.hint === KEY && i.status !== "dropped"));
  const show = $derived(!flies && road > 0);

  function add() {
    setDetailed("transport", true);
    // erstes Auto: alle; weitere: wer noch in keinem Auto sitzt
    const act = app.trip.travelers.filter(isActive).map(x => x.id);
    const seated = new Set(cars.flatMap(c => c.participants || act));
    const rest = act.filter(id => !seated.has(id));
    const it: Item = { id: uid(), cat: "transport", icon: "car", status: "idea", hint: KEY, arrival: true,
      name: cars.length ? t("road.carN", { n: cars.length + 1 }) : t("road.car"),
      note: t("road.carNote", { a: home!.name, b: dest!.name, km: road, c: moneyExact(kmCost, "EUR"), d: FEES_AS_OF }),
      ...(cars.length && rest.length ? { participants: rest } : {}),
      options: [{ id: uid(), label: t("road.fuel"), estimate: true, price: { mode: "unit", currency: "EUR", unit: fuel }, extras: extras.map(x => ({ ...x, id: `${x.id}:${uid()}` })) }] };
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#if show}
  <div class="search-row road">
    <p class="road-t">🚗 <b>{t("road.title2", { b: dest?.name || "" })}</b> <span class="muted small">{["DE", ...route].map(flagOf).join(" → ")} · {t("road.km", { km: road })}</span></p>
    <ul>
      <li>⛽ {t("road.fuelLine", { v: eur(fuel), c: moneyExact(kmCost, "EUR") })}</li>
      {#each rc.vignettes as v (v.cc)}<li>🎫 {flagOf(v.cc)} {t("road.vignette", { c: countryName(v.cc) })} <b>{t("xc.ca")} {moneyExact(v.amount, v.currency)}</b> <span class="muted small">· {tn("n.days", v.days)} · {v.source}</span></li>{/each}
      {#each rc.tolls as c (c)}<li>🛣 {flagOf(c)} {t("road.toll", { c: countryName(c), v: moneyExact(TOLLS[c].per100, TOLLS[c].currency) })}</li>{/each}
    </ul>
    <p class="small road-who">{t("road.who")}</p>
    {#if !access.readonly}
      <button class="btn sm road-add" onclick={add}>+ {cars.length ? t("road.addMore") : t("road.add2", { v: eur(perCar) })}</button>
    {/if}
    <small class="muted road-src">{t("road.src", { d: FEES_AS_OF })}</small>
  </div>
{/if}

<style>
  .road { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); }
  .road-t, .road-who { margin: 0; }
  .road ul { margin: 0; padding-inline-start: 4px; list-style: none; display: grid; gap: 4px; font-size: 13.5px; }
  .road-add { align-self: flex-start; }
</style>
