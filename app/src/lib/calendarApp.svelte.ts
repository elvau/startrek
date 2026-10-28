/*
 * Feiertage und Schulferien für „Termin finden“ (#568): Ferien-Regionen der Familien (#570), Familien mit Schulkindern,
 * Daten je Land über den Such-Dienst (holidaysApp). Sofort nutzbar ohne Daten (dann zählen nur Wochenenden); sobald die
 * Daten da sind, ersetzt calState.ctx den Stand.
 */
import { i18n, tn } from "./i18n/index.svelte";
import { calendarMarks, holidayPlace, regionName } from "./holidays";
import { loaded, loadHolidays, loadRegions } from "./holidaysApp.svelte";
import { hhKey, isActive, type Traveler, type Trip } from "./model";
import { householdRegion } from "./plzRegion";
import type { CalCtx, Fit } from "./datefit";

/** Schulalter (ungefähr): ab 6 bis 18; ohne Alter zählt ein Kind (Platzhalter „Kind 1“) mit, Kleinkinder nicht (#584) */
const schoolKid = (x: Traveler) => (x.age != null ? x.age >= 6 && x.age <= 18 : x.kind === "child");

/**
 * Regionen und Familien mit Schulkindern, ohne Daten. Vorgabe (#584): Region der Familie leadHh (wer die Reise angelegt
 * hat), sonst die erste bekannte; Familien ohne Wohnort bekommen sie.
 */
export function calBase(trip: Trip, leadHh?: string): CalCtx {
  const act = trip.travelers.filter(isActive);
  const own = (hh: string) => householdRegion(trip.households?.[hh])?.region;
  const lead = (leadHh && own(leadHh)) || act.map(x => own(hhKey(x))).find(Boolean);
  const regions: Record<string, string[]> = {}, kid = new Set<string>(), assumed = new Set<string>();
  let kids = false;
  for (const x of act) {
    const hh = hhKey(x);
    if (schoolKid(x)) kids = true;
    const r = own(hh) || lead;
    if (!r) continue;
    if (!own(hh)) assumed.add(hh);
    if (!(regions[r] ||= []).includes(hh)) regions[r].push(hh);
    if (schoolKid(x)) kid.add(r);
  }
  return { regions, kidRegions: [...kid], marks: {}, ...(lead ? { lead } : {}), kids, ...(assumed.size ? { assumed: [...assumed] } : {}) };
}

export const calState = $state({ key: "", ctx: null as CalCtx | null, loading: false });

/** Daten für die Reise laden (einmal je Stand der Regionen und Sprache); bis dahin calBase */
export async function ensureCal(trip: Trip, leadHh?: string) {
  const base = calBase(trip, leadHh);
  const key = JSON.stringify([base.regions, base.kidRegions, base.lead, base.kids, base.assumed, i18n.lang]);
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
  // Schultage anderer Familien (#584)
  const clash = Object.entries(f.clash || {}).map(([r, k]) => tn("tg.clash", k, { fam: (ctx.regions[r] || []).join(", ") || regionLabel(r) }));
  return [...f.hols, ...new Set(Object.values(f.ferien)), vac, ...clash].filter(Boolean).join(" · ");
}
