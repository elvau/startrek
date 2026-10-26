/*
 * Feiertage und Schulferien für „Termin finden“ (#568): Ferien-Regionen der Familien (#570), Familien mit Schulkindern,
 * Daten je Land über den Such-Dienst (holidaysApp). Sofort nutzbar ohne Daten (dann zählen nur Wochenenden); sobald die
 * Daten da sind, ersetzt calState.ctx den Stand.
 */
import { i18n, tn } from "./i18n/index.svelte";
import { calendarMarks, holidayPlace, regionName } from "./holidays";
import { loaded, loadHolidays, loadRegions } from "./holidaysApp.svelte";
import { hhKey, isActive, type Trip } from "./model";
import { householdRegion } from "./plzRegion";
import type { CalCtx, Fit } from "./datefit";

/** Schulalter (ungefähr): ab 6 bis 18 */
const schoolKid = (age?: number | null) => age != null && age >= 6 && age <= 18;

/** Regionen und Familien mit Schulkindern, ohne Daten */
export function calBase(trip: Trip): CalCtx {
  const regions: Record<string, string[]> = {}, kid = new Set<string>();
  for (const x of trip.travelers.filter(isActive)) {
    const hh = hhKey(x);
    const r = householdRegion(trip.households?.[hh])?.region;
    if (!r) continue;
    if (!(regions[r] ||= []).includes(hh)) regions[r].push(hh);
    if (schoolKid(x.age)) kid.add(r);
  }
  return { regions, kidRegions: [...kid], marks: {} };
}

export const calState = $state({ key: "", ctx: null as CalCtx | null, loading: false });

/** Daten für die Reise laden (einmal je Stand der Regionen und Sprache); bis dahin calBase */
export async function ensureCal(trip: Trip) {
  const base = calBase(trip);
  const key = JSON.stringify([base.regions, base.kidRegions, i18n.lang]);
  if (calState.key === key) return;
  void loadRegions();
  calState.key = key; calState.ctx = base; calState.loading = true;
  const marks: CalCtx["marks"] = {};
  for (const r of Object.keys(base.regions)) {
    const p = holidayPlace(r);
    if (!p) continue;
    const d = await loadHolidays(p.cc);
    if (d) marks[r] = calendarMarks(d, p.region, i18n.lang);
  }
  if (calState.key !== key) return;
  calState.ctx = { ...base, marks };
  calState.loading = false;
}

/** Name einer Ferien-Region („Nordrhein-Westfalen“; ganzes Land: Kürzel) */
export const regionLabel = (r: string) => (r.endsWith("-") ? r.slice(0, -1) : regionName(loaded.regions, r, i18n.lang));

/** Grund eines Termins: Feiertage, Ferien, Urlaubstage (gleich für alle oder je Region) */
export function fitWhy(f: Fit, ctx: CalCtx): string {
  const n = Object.keys(ctx.regions).length;
  const vs = Object.entries(f.vac);
  const same = vs.length === n && new Set(vs.map(([, v]) => v)).size === 1;
  const vac = !vs.length ? "" : same || n < 2 ? tn("tg.vac", vs[0][1]) : vs.map(([r, v]) => `${regionLabel(r)}: ${tn("tg.vac", v)}`).join(", ");
  return [...f.hols, ...new Set(Object.values(f.ferien)), vac].filter(Boolean).join(" · ");
}
