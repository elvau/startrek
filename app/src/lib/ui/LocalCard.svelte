<script lang="ts">
  /* Transport vor Ort (#420): geschätzter Flughafentransfer und Unterwegssein (Nahverkehr bzw. Sprit), bis selbst geplant */
  import { t } from "../i18n/index.svelte";
  import { access, app, calc } from "../store.svelte";
  import { eur, moneyExact } from "../calc";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { localPlanFor, syncLocal } from "../localcost";

  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });

  const on = $derived(!!app.trip.local?.on);
  const plan = $derived.by(() => { void Object.keys(geo.places).length; void airportData.airports.length; return localPlanFor(app.trip, geo, airportData); });
  // Posten nachführen, sobald sich Flüge, Unterkünfte, Personen, Daten oder eigene Transport-Posten ändern
  $effect(() => { if (!access.readonly) syncLocal(app.trip, plan, v => moneyExact(v, "EUR")); });

  const items = $derived(app.trip.items.filter(i => i.auto === "local"));
  const sum = $derived(items.reduce((a, i) => a + (calc.T.items[i.id]?.counts ? calc.T.items[i.id].net : 0), 0));
  const setOn = (v: boolean) => (app.trip.local = { ...(app.trip.local || {}), on: v });
</script>

<div class="plan local">
  <div class="plan-h"><h3>{t("local.title")}</h3>{#if on && sum}<span class="muted">{t("parts.ca", { v: eur(sum) })}</span>{/if}</div>
  {#if !on}
    <p class="muted">{t("local.lead")}</p>
    {#if !access.readonly}<div><button class="btn primary sm local-on" onclick={() => setOn(true)}>{t("local.on")}</button></div>{/if}
  {:else}
    {#if items.length}
      <ul class="local-rows">
        {#each items as it (it.id)}
          <li><div class="local-h"><b>{it.name}</b><b class="num">{t("parts.ca", { v: eur(calc.T.items[it.id]?.net || 0) })}</b></div>
            <span class="muted small">{it.options[0]?.detail}</span></li>
        {/each}
      </ul>
    {:else}
      <p class="muted small">{t("local.none")}</p>
    {/if}
    <p class="muted small">{t("local.replaced")}{#if !access.readonly}{" "}<button class="linkbtn local-off" onclick={() => setOn(false)}>{t("food.off")}</button>{/if}</p>
  {/if}
</div>

<style>
  .local{margin:10px 0 4px}
  .local-rows{list-style:none;margin:6px 0;padding:0;display:flex;flex-direction:column;gap:6px}
  .local-rows li{display:flex;flex-direction:column;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}
  .local-h{display:flex;justify-content:space-between;gap:10px}
</style>
