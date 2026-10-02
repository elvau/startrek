<script lang="ts">
  /*
   * Bahn, Fernbus, Auto, Reisebus: bei nahen Zielen Richtwerte pro Person (hin und zurück) und Links zur Suche.
   * Start ist der Wohnort der Gruppe (PLZ im Haushalt), Ziel der Anlass der Reise oder der Reiseort.
   */
  import { t, tn } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { eur } from "../calc";
  import { isActive } from "../model";
  import { hasCoords } from "../geo/maps";
  import { ccOf, findCity } from "../geo/places";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { COACH_LINKS, COACH_MIN, RAIL_LINKS, bahnLink, coachItem, groundPlan, homeOf, routeLink, tripDays, type Spot } from "../ground";
  import { setDetailed } from "../store.svelte";
  import { showItem } from "./showItem";

  let { city }: { city: string } = $props();

  $effect(() => { if (city) void ensureGeo(app.trip).catch(() => {}); });

  const dest = $derived.by((): Spot | null => {
    const ev = app.trip.event;
    if (ev && hasCoords(ev)) return { name: city || ev.name, lat: ev.lat!, lon: ev.lon! };
    if (!city) return null;
    // geo.places nur lesen, damit nach dem Laden neu gerechnet wird
    void Object.keys(geo.places).length;
    const c = findCity(geo, city, ccOf(geo, app.trip.country)) || findCity(geo, city);
    return c ? { name: city, lat: c.lat, lon: c.lon } : null;
  });
  const home = $derived(homeOf(app.trip));
  const persons = $derived(app.trip.travelers.filter(isActive).length);
  const plan = $derived(home && dest ? groundPlan(home, dest, persons, tripDays(app.trip), app.trip.settings.kmCost ?? 0.3) : null);
  const ICON = { train: "🚆", bus: "🚌", car: "🚗", coach: "🚍" } as const;
  const hrs = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 6)) * 10} min` : `${Math.round(h * 2) / 2} h`.replace(".", ","));

  function addCoach() {
    if (!plan?.coach) return;
    setDetailed("transport", true);
    const it = coachItem(plan);
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#if plan}
  <div class="card ground">
    <h3>{t("gr.title", { a: plan.from.name, b: plan.to.name, km: Math.round(plan.road) })}</h3>
    <p class="muted small">{t("gr.hint")}</p>
    <ul class="gr-list">
      {#each plan.modes as m (m.k)}
        <li class="gr-row gr-{m.k}">
          <span class="gr-n">{ICON[m.k]} <b>{t(`gr.${m.k}`)}</b>
            <small>{m.k === "coach" && plan.coach ? `${t(`gr.size.${plan.coach.size}`)}${plan.coach.buses > 1 ? ` × ${plan.coach.buses}` : ""} · ` : ""}{m.k === "car" ? `${tn("gr.cars", Math.ceil(plan.persons / 5))} · ` : ""}≈ {hrs(m.hours)}</small></span>
          <span class="gr-v num">{m.lo === m.hi ? eur(m.lo) : `${eur(m.lo)} – ${eur(m.hi)}`}</span>
        </li>
      {/each}
    </ul>
    <p class="muted small gr-pp">{t("gr.pp")}</p>
    <p class="small fs-direct gr-links">{t("gr.search")}
      <a href={bahnLink(plan.from.name, plan.to.name, app.trip.from)} target="_blank" rel="noopener noreferrer">bahn.de ↗</a> ·
      <a href={routeLink(plan.from.name, plan.to.name)} target="_blank" rel="noopener noreferrer">Google Maps ↗</a>
      {#each RAIL_LINKS as l (l.name)} · <a href={l.url} target="_blank" rel="noopener noreferrer">{l.name} ↗</a>{/each}
    </p>
    {#if plan.coach}
      <div class="gr-coach">
        <p class="small">{t("gr.coachHint", { v: eur(plan.coach.total), n: plan.persons })}</p>
        {#if !access.readonly}<button class="btn sm primary gr-coach-add" onclick={addCoach}>🚍 {t("gr.coachAdd")}</button>{/if}
        <p class="small fs-direct gr-links">{t("gr.coachAsk")}
          {#each COACH_LINKS as l, i (l.name)}{i ? " · " : ""}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.name} ↗</a>{/each}
        </p>
      </div>
    {:else if plan.persons < COACH_MIN}
      <p class="muted small">{t("gr.coachFrom", { n: COACH_MIN })}</p>
    {/if}
  </div>
{/if}

<style>
  .ground { padding: 14px 16px; margin: 10px 0; }
  .ground h3 { margin: 0 0 4px; font-size: 1rem; }
  .gr-list { list-style: none; margin: 10px 0 4px; padding: 0; display: grid; gap: 6px; }
  .gr-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .gr-n small { display: block; color: var(--ink-2); margin-left: 1.6em; }
  .gr-v { white-space: nowrap; font-weight: 600; }
  .gr-coach { border-top: 1px solid var(--line); margin-top: 8px; padding-top: 8px; }
  .gr-coach p { margin: 4px 0; }
  .gr-links { margin: 6px 0 0; }
</style>
