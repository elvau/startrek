<script lang="ts">
  import { t, tn, type Key } from "../i18n/index.svelte";
  /* Verpflegung wie im Artefakt: Essensstil für alle oder je Familie, Tagessatz aus den Länderdaten, dazu Restaurants und Supermärkte */
  import { access, app, calc, setDetailed } from "../store.svelte";
  import { eur } from "../calc";
  import { FOOD_STYLES, foodCfg, foodPlan, syncFood } from "../food";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { mapsSearchLink, tripadvisorRestaurantsLink } from "../links";
  import type { FoodStyle } from "../model";

  $effect(() => { ensureGeo(app.trip); });
  // Posten nachführen, sobald sich Personen, Anwesenheit, Ziel oder Stil ändern
  $effect(() => { if (!access.readonly) syncFood(app.trip, geo); });

  const cfg = $derived(foodCfg(app.trip));
  const rows = $derived(cfg.on ? foodPlan(app.trip, geo) : []);
  const sum = $derived(app.trip.items.filter(i => i.auto === "food").reduce((a, i) => a + (calc.T.items[i.id]?.counts ? calc.T.items[i.id].net : 0), 0));
  const place = $derived(app.trip.place);

  function turnOn() {
    setDetailed("misc", true);
    app.trip.food = { ...(app.trip.food || {}), on: true };
  }
  const setStyle = (k: FoodStyle) => (app.trip.food = { ...foodCfg(app.trip), style: k });
  function setHh(hh: string, k: FoodStyle | null) {
    const c = foodCfg(app.trip);
    const map = { ...(c.hh || {}) };
    if (k) map[hh] = k; else delete map[hh];
    app.trip.food = { ...c, hh: map };
  }
</script>

<div class="plan food">
  <div class="plan-h"><h3>{t("food.title")}</h3>{#if cfg.on}<span class="muted">{eur(sum)} · {t("food.perDay")}</span>{/if}</div>
  {#if !cfg.on}
    <p class="muted">{t("food.lead")}</p>
    {#if !access.readonly}<div><button class="btn primary sm" onclick={turnOn}>{t("food.on")}</button></div>{/if}
  {:else}
    <div class="chips" role="radiogroup" aria-label={t("food.styleAll")}>
      {#each FOOD_STYLES as s (s.k)}<button class="chip sm" class:on={cfg.style === s.k} title={s.d} disabled={access.readonly} onclick={() => setStyle(s.k)}>{s.l}</button>{/each}
    </div>
    <ul class="food-rows">
      {#each rows as r (r.hh)}
        {@const it = app.trip.items.find(i => i.auto === "food" && i.hh === r.hh)}
        <li>
          <div class="food-h"><b>{r.hh}</b><span class="muted small">{t("food.row", { p: r.ids.length, d: tn("n.days", r.days), a: eur(r.eur), c: eur(Math.round(r.eur * cfg.child / 100)) })}{r.est ? ` (${t("food.est")})` : ""}</span><b class="num">{eur(it ? calc.T.items[it.id]?.net || 0 : 0)}</b></div>
          {#if r.board}<div class="food-board small">🛏 {t("food.byStay", { b: t(`board.${r.board}` as Key) })}</div>{/if}
          {#if rows.length > 1 && !access.readonly}
            <div class="chips">
              <button class="chip sm" class:on={!r.own} onclick={() => setHh(r.hh, null)}>{t("food.likeAll")}</button>
              {#each FOOD_STYLES as s (s.k)}<button class="chip sm" class:on={r.own && r.style === s.k} title={s.d} onclick={() => setHh(r.hh, s.k)}>{s.l}</button>{/each}
            </div>
          {/if}
        </li>
      {:else}
        <li class="muted small">{t("food.noDays")}</li>
      {/each}
    </ul>
    <p class="muted small">{FOOD_STYLES.find(s => s.k === cfg.style)?.d}. {t("food.rates", { c: cfg.child, i: cfg.infant })}
      {#if !access.readonly}<button class="linkbtn" onclick={() => (app.trip.food = { ...foodCfg(app.trip), on: false })}>{t("food.off")}</button>{/if}</p>
  {/if}
  {#if place}
    <p class="muted small fs-direct">{t("food.in", { place })} <a href={mapsSearchLink(t("food.restaurantsQ"), place)} target="_blank" rel="noopener noreferrer">{t("food.restaurants")} ↗</a> · <a href={tripadvisorRestaurantsLink(place)} target="_blank" rel="noopener noreferrer">Tripadvisor ↗</a> · <a href={mapsSearchLink(t("food.supermarketQ"), place)} target="_blank" rel="noopener noreferrer">{t("food.supermarkets")} ↗</a></p>
  {/if}
</div>
