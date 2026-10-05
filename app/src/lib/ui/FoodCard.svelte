<script lang="ts">
  import { TIPS } from "../fees";
  import { imp } from "../importantState.svelte";
  import { flagOf } from "../format";
  import { t, tn, type Key } from "../i18n/index.svelte";
  /* Verpflegung wie im Artefakt: Essensstil für alle oder je Familie, Tagessatz aus den Länderdaten, dazu Restaurants und Supermärkte */
  import { access, app, calc, setDetailed } from "../store.svelte";
  import { eur } from "../calc";
  import { FOOD_STYLES, foodCfg, foodGroups, foodPlan, syncFood } from "../food";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { mapsSearchLink } from "../links";
  import PartnerLinks from "./PartnerLinks.svelte";
  import type { FoodStyle } from "../model";

  $effect(() => { ensureGeo(app.trip); });
  // Posten nachführen, sobald sich Personen, Anwesenheit, Ziel oder Stil ändern
  $effect(() => { if (!access.readonly) syncFood(app.trip, geo); });

  const cfg = $derived(foodCfg(app.trip));
  const rows = $derived(cfg.on ? foodPlan(app.trip, geo) : []);
  // gleiche Verpflegung zusammen (eine Zeile statt einer je Person); abweichend für eine Familie über die Auswahl darunter
  const groups = $derived(foodGroups(rows));
  let pick = $state("");
  const picked = $derived(rows.find(r => r.hh === pick));
  const names = (hhs: string[]) => (hhs.length === rows.length && rows.length > 1 ? t("food.allHh", { n: hhs.length }) : hhs.length > 4 ? `${hhs.slice(0, 3).join(", ")} +${hhs.length - 3}` : hhs.join(", "));
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
  // Trinkgeld im Reiseland (gepflegte Gepflogenheiten)
  const tipCc = $derived(imp.countries[0] || "");
  const tip = $derived(tipCc ? TIPS[tipCc] : undefined);
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
      {#each groups as g (g.key)}
        {@const it = app.trip.items.find(i => i.auto === "food" && i.hh === g.key)}
        <li>
          <div class="food-h"><b title={g.hhs.join(", ")}>{names(g.hhs)}</b><span class="muted small">{FOOD_STYLES.find(s => s.k === g.style)?.l} · {t("food.row", { p: g.ids.length, d: tn("n.days", g.days), a: eur(g.eur), c: eur(Math.round(g.eur * cfg.child / 100)) })}{g.est ? ` (${t("food.est")})` : ""}</span><b class="num">{eur(it ? calc.T.items[it.id]?.net || 0 : 0)}</b></div>
          {#if g.board}<div class="food-board small">🛏 {t("food.byStay", { b: t(`board.${g.board}` as Key) })}</div>{/if}
          {#if g.own && !access.readonly}<button class="linkbtn small" onclick={() => g.hhs.forEach(h => setHh(h, null))}>{t("food.likeAll")}</button>{/if}
        </li>
      {:else}
        <li class="muted small">{t("food.noDays")}</li>
      {/each}
    </ul>
    {#if rows.length > 1 && !access.readonly}
      <div class="food-own">
        <label class="f">{t("food.ownFor")}<select bind:value={pick}><option value="">–</option>{#each rows as r (r.hh)}<option value={r.hh}>{r.hh}</option>{/each}</select></label>
        {#if picked}
          <div class="chips">
            <button class="chip sm" class:on={!picked.own} onclick={() => setHh(picked.hh, null)}>{t("food.likeAll")}</button>
            {#each FOOD_STYLES as s (s.k)}<button class="chip sm" class:on={picked.own && picked.style === s.k} title={s.d} onclick={() => setHh(picked.hh, s.k)}>{s.l}</button>{/each}
          </div>
        {/if}
      </div>
    {/if}
    <p class="muted small">{FOOD_STYLES.find(s => s.k === cfg.style)?.d}. {t("food.rates", { c: cfg.child, i: cfg.infant })}
      {#if !access.readonly}<button class="linkbtn" onclick={() => (app.trip.food = { ...foodCfg(app.trip), on: false })}>{t("food.off")}</button>{/if}</p>
  {/if}
  {#if place}
    <p class="muted small fs-direct">{t("food.in", { place })} <a href={mapsSearchLink(t("food.restaurantsQ"), place)} target="_blank" rel="noopener noreferrer">{t("food.restaurants")} ↗</a> · <PartnerLinks ids={["tripadvisor"]} q={place} /> · <a href={mapsSearchLink(t("food.supermarketQ"), place)} target="_blank" rel="noopener noreferrer">{t("food.supermarkets")} ↗</a></p>
  {/if}
  {#if tip}
    <!-- Trinkgeld und typische Kosten vor Ort: nur als Hinweis, nicht in den Kosten (#170) -->
    <p class="food-tip small">💶 {flagOf(tipCc)} {t(`tip.${tip.norm}${tip.norm === "round" && !tip.v ? "0" : ""}` as Key, { v: tip.v || "" })}{#each tip.local || [] as l (l)}{" · "}{t(`tip.local.${l}` as Key)}{/each}</p>
  {/if}
</div>

<style>
  .food-tip { margin: 10px 0 0; color: var(--ink-2); }
  .food-own { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; margin: 6px 0; }
  .food-own select { min-width: 160px; }
</style>
