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
  import { roadPlan, cityNear } from "../road/road.svelte";
  import { LONG_H, roadTripCost, withPauses, type Etappe } from "../road/trip";
  import { splitLeg } from "../road/split";
  import { openStaySearch } from "../stays/open.svelte";
  import { dayShort } from "../format";
  import PartnerLinks from "./PartnerLinks.svelte";
  import { partnersOf } from "../partners";

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
  // Roadtrip (#201): Etappen über die Stationen; sonst wie bisher nur Wohnort → Ziel
  const plan = $derived(flies ? null : roadPlan(app.trip));
  const cost = $derived(plan ? roadTripCost(plan.etappen, kmCost, rate, app.trip.from || "") : null);
  const perRound = $derived(cost ? cost.fuel + cost.extras.reduce((s, x) => s + x.amount, 0) : 0);
  const totalMin = $derived(plan ? plan.etappen.filter(e => !e.ferry).reduce((s, e) => s + withPauses(e.min), 0) : 0);
  const show = $derived(!flies && (road > 0 || !!plan));
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
  const long = (e: Etappe) => !e.ferry && withPauses(e.min) > LONG_H * 60;
  // Fähren (#202): Wahl der Verbindung je Überfahrt, Preise je Fahrzeug und Person, Kabine nur auf Wunsch
  const persons = $derived(app.trip.travelers.filter(isActive).length || 1);
  function pickFerry(e: Etappe, id: string) {
    if (!e.key) return;
    app.trip.ferry = { ...(app.trip.ferry || {}), [e.key]: id };
  }
  function ferryPrice(e: Etappe): string {
    const f = e.ferry!.ferry, m = (v: number) => moneyExact(v, f.currency);
    const parts = [
      f.car != null ? (f.pkg ? t("road.ferryPkg", { v: m(f.car) }) : t("road.ferryCar", { v: m(f.car) })) : t("road.ferryNoPrice"),
      f.person != null && !f.pkg ? t("road.ferryPers", { n: persons, v: m(f.person) }) : "",
      f.cabin != null && f.night && !f.pkg ? t("road.ferryCabin", { v: m(f.cabin) }) : ""
    ];
    return parts.filter(Boolean).join(" · ");
  }
  const roadOnly = $derived(cost ? cost.extras.filter(x => x.kind === "vignette" || x.kind === "toll") : []);
  /** Kennung ohne die angehängte Zufalls-ID des Postens */
  const baseId = (id: string) => id.split(":").slice(0, -1).join(":");
  const roundName = $derived(plan ? plan.stops.slice(1, -1).map(s => s.name).join(" → ") : "");

  function optionFor(): Item["options"][number] {
    if (cost && plan) return { id: uid(), label: t("road.fuel"), estimate: true, price: { mode: "unit", currency: "EUR", unit: cost.fuel }, extras: cost.extras.map(x => ({ ...x, id: `${x.id}:${uid()}` })) };
    return { id: uid(), label: t("road.fuel"), estimate: true, price: { mode: "unit", currency: "EUR", unit: fuel }, extras: extras.map(x => ({ ...x, id: `${x.id}:${uid()}` })) };
  }
  const noteFor = () => (plan && cost
    ? t("road.tripNote", { a: plan.stops[0].name, r: roundName, km: cost.km, c: moneyExact(kmCost, "EUR"), d: FEES_AS_OF })
    : t("road.carNote", { a: home!.name, b: dest!.name, km: road, c: moneyExact(kmCost, "EUR"), d: FEES_AS_OF }));
  /** bestehende Auto-Posten auf die aktuelle Runde rechnen (nach Teilen bzw. neuen Stationen) */
  function refresh() {
    for (const c of cars) {
      const o = c.options[0];
      if (!o) continue;
      const n = optionFor();
      o.price = n.price; o.extras = n.extras; c.note = noteFor();
    }
  }
  const stale = $derived(!!cost && cars.some(c => Math.abs((c.options[0]?.price.unit || 0) - cost!.fuel) >= 1
    || (c.options[0]?.extras || []).map(x => baseId(x.id)).sort().join() !== cost!.extras.map(x => x.id).sort().join()));
  function split(e: Etappe, n: number) {
    const made = splitLeg(app.trip, e, n, cityNear);
    setDetailed("stay", true);
    return made;
  }
  function searchStop(e: Etappe) {
    const [s] = split(e, 2);
    if (s) openStaySearch({ from: s.from, to: s.to, place: s.options[0]?.query?.place, itemId: s.id });
  }

  function add() {
    setDetailed("transport", true);
    // erstes Auto: alle; weitere: wer noch in keinem Auto sitzt
    const act = app.trip.travelers.filter(isActive).map(x => x.id);
    const seated = new Set(cars.flatMap(c => c.participants || act));
    const rest = act.filter(id => !seated.has(id));
    const it: Item = { id: uid(), cat: "transport", icon: "car", status: "idea", hint: KEY, arrival: true,
      name: plan ? (cars.length ? t("road.tripN", { n: cars.length + 1 }) : t("road.trip")) : cars.length ? t("road.carN", { n: cars.length + 1 }) : t("road.car"),
      note: noteFor(),
      ...(cars.length && rest.length ? { participants: rest } : {}),
      options: [optionFor()] };
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#if show && plan && cost}
  <div class="search-row road road-trip">
    <p class="road-t">🚗 <b>{t("road.tripTitle")}</b> <span class="muted small">{t("road.tripSum", { km: cost.km, h: hm(totalMin) })}</span></p>
    <ol class="rt-legs">
      {#each plan.etappen as e, i (i)}
        {#if e.ferry}
          <li class="rt-ferry">
            <span class="rt-d muted small">{e.date ? dayShort(e.date) : ""}</span>
            <span class="rt-n"><b>⛴ {e.ferry.from.name} → {e.ferry.to.name}</b> <span class="muted small">{e.ferry.ferry.ops.join(", ")}{e.ferry.ferry.night ? ` · ${t("road.night")}` : ""}</span></span>
            <span class="rt-k num small">{t("road.ferryH", { h: hm(e.min) })}</span>
            <span class="rt-fx small">
              {#if (e.alts?.length || 0) > 1 && !access.readonly}
                <select class="rt-pick" aria-label={t("road.ferryPick")} value={e.ferry.ferry.id} onchange={ev => pickFerry(e, ev.currentTarget.value)}>
                  {#each e.alts || [] as a (a.ferry.id)}<option value={a.ferry.id}>{a.from.name} → {a.to.name} ({hm(Math.round(a.ferry.hours * 60))})</option>{/each}
                </select>
              {/if}
              <span>{t("xc.ca")} {ferryPrice(e)}</span>
              <span class="muted">{t("road.ferryCompare")} <PartnerLinks ids={partnersOf("ferry")} /></span>
            </span>
          </li>
        {:else}
        <li class:long={long(e)}>
          <span class="rt-d muted small">{e.date ? dayShort(e.date) : ""}</span>
          <span class="rt-n"><b>{e.from.name} → {e.to.name}</b> <span class="muted small">{Object.keys(e.cc).filter(c => e.cc[c] >= 5).map(flagOf).join(" ")}</span></span>
          <span class="rt-k num small">{t("road.legKm", { km: Math.round(e.km), h: hm(withPauses(e.min)) })}</span>
          {#if long(e)}
            <span class="rt-long small">⚠ {t("road.long", { h: LONG_H })}
              {#if !access.readonly && e.date}
                <button type="button" class="linkbtn rt-search" onclick={() => searchStop(e)}>🛏 {t("road.searchStop")}</button>
                <button type="button" class="linkbtn rt-split" onclick={() => split(e, 2)}>{t("road.split", { n: 2 })}</button>
                <button type="button" class="linkbtn rt-split3" onclick={() => split(e, 3)}>{t("road.split", { n: 3 })}</button>
              {/if}
            </span>
          {/if}
        </li>
        {/if}
      {/each}
    </ol>
    <ul>
      <li>⛽ {t("road.fuelRound", { v: eur(cost.fuel), c: moneyExact(kmCost, "EUR") })}</li>
      {#each roadOnly as x (x.id)}<li>{x.kind === "vignette" ? "🎫" : "🛣"} {flagOf(x.cc || "")} {x.kind === "vignette" ? t("road.vignette", { c: countryName(x.cc || "") }) : t("road.tollKm", { c: countryName(x.cc || "") })} <b>{t("xc.ca")} {eur(x.amount)}</b> <span class="muted small">· {x.source}</span></li>{/each}
    </ul>
    <p class="small road-who">{t("road.who")}</p>
    {#if !access.readonly}
      <div class="rt-acts">
        <button class="btn sm road-add" onclick={add}>+ {cars.length ? t("road.addMore") : t("road.add2", { v: eur(perRound) })}</button>
        {#if stale}<button class="btn sm rt-refresh" onclick={refresh}>↻ {t("road.refresh")}</button>{/if}
      </div>
    {/if}
    <small class="muted road-src">{plan.est ? t("road.srcEst", { d: FEES_AS_OF }) : t("road.srcOrs", { d: FEES_AS_OF })}</small>
  </div>
{:else if show}
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
  .rt-legs { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .rt-legs li { display: grid; grid-template-columns: 5.5em 1fr auto; gap: 2px 10px; align-items: baseline; }
  .rt-long { grid-column: 2 / -1; color: var(--warn); display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
  .rt-long .linkbtn { font-size: 12.5px; padding: 0; }
  .rt-acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .rt-fx { grid-column: 2 / -1; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
  .rt-pick { font-size: 12.5px; padding: 2px 4px; }
</style>
