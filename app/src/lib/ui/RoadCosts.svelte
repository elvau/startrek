<script lang="ts">
  /* Anreise mit dem Auto ins Ausland: Vignetten und Maut auf der Strecke (gepflegte Richtwerte, #170) */
  import { t, tn } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { eur, moneyExact, rateOf } from "../calc";
  import { isActive, uid } from "../model";
  import { FEES_AS_OF, TOLLS, roadCosts, routeCountries } from "../fees";
  import { countryName } from "../geo/locations";
  import { flagOf } from "../format";
  import { imp } from "../importantState.svelte";
  import { origin } from "../flights/origin.svelte";
  import { showItem } from "./showItem";

  // Wohnort: Postleitzahlen gibt es für Deutschland, sonst das Land der Verbindung
  const home = $derived(Object.values(app.trip.households || {}).some(h => h.geo) ? "DE" : origin.where?.cc || "DE");
  const flies = $derived(app.trip.items.some(i => i.cat === "flights" && i.status !== "dropped"));
  const dest = $derived(imp.countries[0] || "");
  const route = $derived(!flies && dest && dest !== home ? routeCountries(home, dest) : []);
  const rc = $derived(roadCosts(route));
  const cars = $derived(Math.max(1, Math.ceil(app.trip.travelers.filter(isActive).length / 5)));
  const vigEur = $derived(rc.vignettes.reduce((s, v) => s + v.amount / rateOf(v.currency, app.trip.settings), 0));
  const KEY = "road:vignettes";
  const added = $derived(app.trip.items.some(i => i.hint === KEY));
  function add() {
    if (added || !rc.vignettes.length) return;
    setDetailed("transport", true);
    const it = { id: uid(), cat: "transport" as const, icon: "car", name: t("road.item", { list: rc.vignettes.map(v => countryName(v.cc)).join(", ") }), status: "idea" as const, hint: KEY,
      note: t("road.note", { d: FEES_AS_OF }),
      options: [{ id: uid(), label: t("hint.estimate"), estimate: true, price: { mode: "unit" as const, currency: "EUR", unit: Math.round(vigEur * 100) / 100, qty: cars } }] };
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#if rc.vignettes.length || rc.tolls.length}
  <div class="search-row road">
    <p class="road-t">🛣 <b>{t("road.title", { c: countryName(dest) })}</b> <span class="muted small">{route.map(flagOf).join(" → ")}</span></p>
    <ul>
      {#each rc.vignettes as v (v.cc)}<li>{flagOf(v.cc)} {t("road.vignette", { c: countryName(v.cc) })} <b>{t("xc.ca")} {moneyExact(v.amount, v.currency)}</b> <span class="muted small">· {tn("n.days", v.days)} · {v.source}</span></li>{/each}
      {#each rc.tolls as c (c)}<li>{flagOf(c)} {t("road.toll", { c: countryName(c), v: moneyExact(TOLLS[c].per100, TOLLS[c].currency) })} <span class="muted small">· {TOLLS[c].source}</span></li>{/each}
    </ul>
    {#if rc.vignettes.length && !access.readonly}
      {#if added}<small class="muted">✓ {t("road.added")}</small>
      {:else}<button class="btn sm road-add" onclick={add}>+ {t("road.add", { v: eur(vigEur * cars) })}</button>{/if}
    {/if}
    <small class="muted road-src">{t("road.src", { d: FEES_AS_OF })}</small>
  </div>
{/if}

<style>
  .road { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); }
  .road-t { margin: 0; }
  .road ul { margin: 0; padding-inline-start: 4px; list-style: none; display: grid; gap: 4px; font-size: 13.5px; }
  .road-add { align-self: flex-start; }
</style>
