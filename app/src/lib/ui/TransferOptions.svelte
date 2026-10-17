<script lang="ts">
  /*
   * Flughafentransfer: vom Ankunftsflughafen (aus den Flügen, sonst dem nächsten großen Flughafen am Ziel) zur
   * Unterkunft (mit Lage) oder in die Ortsmitte. Auswahl Bahn, Bus oder Taxi (Richtwert je Fahrt; Mietwagen gilt für die
   * ganze Reise und steht darunter im Kapitel); ein Tipp
   * legt den Posten mit allen Möglichkeiten als Angebote an, die gewählte aktiv. Anbieter und Route zum Vergleichen.
   */
  import { t } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { eur } from "../calc";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { routeLink } from "../ground";
  import { tripTransferLegs } from "../localcost";
  import PartnerLinks from "./PartnerLinks.svelte";
  import { partnersOf } from "../partners";
  import { TRANSFER_ICON, transferItem, vehicleText, type TransferPlan } from "../transfer";
  import type { TransferChoice, TransferKind } from "../transit";
  import { showItem } from "./showItem";

  let { city }: { city: string } = $props();

  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });

  const legs = $derived.by(() => { void Object.keys(geo.places).length; return tripTransferLegs(app.trip, geo, airportData, city); });

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
    </div>
  </div>
  <p class="search-row muted small fs-direct tr-links">
    {t("tr.compare")}
    <PartnerLinks ids={partnersOf("transfer")} />
    · <a href={routeLink(`${ap.lat},${ap.lon}`, `${dest.lat},${dest.lon}`, "transit")} target="_blank" rel="noopener noreferrer">{t("tr.routeTransit")} ↗</a>
    · <a href={routeLink(`${ap.lat},${ap.lon}`, `${dest.lat},${dest.lon}`, "driving")} target="_blank" rel="noopener noreferrer">{t("tr.routeCar")} ↗</a>
  </p>
{/each}
