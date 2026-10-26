/*
 * Welche Tage kommen in Frage (#568): Zeiträume für „Termin finden“ nach Wochenenden, langen Wochenenden, Brückentagen,
 * Schulferien und „schulkindkonform“. Feiertage und Ferien je Ferien-Region der Familien (#570), Daten aus
 * OpenHolidays (holidays.ts). Rein rechnend; die Daten lädt calendarApp.svelte.ts.
 *
 * Ein Zeitraum geht vom Anreise- bis zum Abreisetag (Nächte = Abstand). Der Anreisetag zählt nie als Arbeits- oder
 * Schultag (Abfahrt nach Arbeit bzw. Schule); Urlaubstage sind die Werktage danach bis einschließlich Abreisetag.
 */
import { addDay } from "./together";
import type { DayMark } from "./holidays";

export type DaysMode = "all" | "weekend";
/** Schulferien: mitnehmen (egal), meiden, nur in den Ferien */
export type FerienMode = "take" | "avoid" | "only";
export interface DaysCfg { days?: DaysMode; school?: boolean; bridges?: boolean; ferien?: FerienMode }

export interface CalCtx {
  /** Ferien-Regionen der Familien („DE-NW“, „AT-“), je Region die Familien */
  regions: Record<string, string[]>;
  /** Regionen von Familien mit Schulkindern */
  kidRegions: string[];
  /** je Region: Tag → Feiertag bzw. Schulferien (Name) */
  marks: Record<string, Record<string, DayMark>>;
}

const wd = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
export const isWeekend = (d: string) => wd(d) === 0 || wd(d) === 6;
const regionsOf = (c: CalCtx) => Object.keys(c.regions);
const pub = (c: CalCtx, r: string, d: string) => c.marks[r]?.[d]?.pub;
const ferien = (c: CalCtx, r: string, d: string) => c.marks[r]?.[d]?.school;

/** Werktag in einer Region (Mo–Fr, kein Feiertag dort) */
export const workday = (c: CalCtx, r: string, d: string) => !isWeekend(d) && !pub(c, r, d);
/** frei für Erwachsene: Wochenende oder Feiertag in irgendeiner Region (regionale Feiertage zählen, #568) */
const freeAny = (c: CalCtx, d: string) => isWeekend(d) || regionsOf(c).some(r => pub(c, r, d));
/** Schultag für Kinder einer Region: Werktag ohne Ferien */
const schoolDay = (c: CalCtx, r: string, d: string) => workday(c, r, d) && !ferien(c, r, d);

/** Tage nach dem Anreisetag bis einschließlich Abreisetag */
function after(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = addDay(from, 1); d <= to; d = addDay(d, 1)) out.push(d);
  return out;
}
function span(from: string, to: string): string[] {
  return [from, ...after(from, to)];
}

export interface Fit {
  ok: boolean;
  /** Urlaubstage für Berufstätige je Region (nur Regionen mit mehr als 0) */
  vac: Record<string, number>;
  /** Feiertage im Zeitraum (Namen, ohne Dopplungen) */
  hols: string[];
  /** Schulferien im Zeitraum (Name je Region) */
  ferien: Record<string, string>;
}

/** Passt der Zeitraum zu den Einstellungen? Mit Urlaubstagen, Feiertagen und Ferien für die Anzeige */
export function fits(from: string, to: string, cfg: DaysCfg, c: CalCtx): Fit {
  const rest = after(from, to), all = span(from, to);
  const regs = regionsOf(c);
  const vac: Record<string, number> = {};
  for (const r of regs.length ? regs : [""]) { const n = rest.filter(d => r ? workday(c, r, d) : !isWeekend(d)).length; if (n) vac[r] = n; }
  const hols = [...new Set(all.flatMap(d => regs.map(r => pub(c, r, d)).filter((x): x is string => !!x)))];
  const fer: Record<string, string> = {};
  for (const r of regs) { const n = all.map(d => ferien(c, r, d)).find(Boolean); if (n) fer[r] = n; }
  const out = (ok: boolean): Fit => ({ ok, vac, hols, ferien: fer });

  // Schulferien meiden bzw. nur in den Ferien (Regionen mit Ferien-Daten)
  const withFerien = regs.filter(r => Object.values(c.marks[r] || {}).some(m => m.school));
  if (cfg.ferien === "avoid" && all.some(d => withFerien.some(r => ferien(c, r, d)))) return out(false);
  if (cfg.ferien === "only" && (!withFerien.length || !all.every(d => withFerien.every(r => ferien(c, r, d))))) return out(false);
  // schulkindkonform: nach dem Anreisetag kein Schultag in einer Region mit Schulkindern
  if (cfg.school && rest.some(d => c.kidRegions.some(r => schoolDay(c, r, d)))) return out(false);
  if (cfg.days !== "weekend") return out(true);

  // Wochenenden: nach dem Anreisetag nur freie Tage (Wochenende, Feiertag) …
  if (rest.every(d => freeAny(c, d))) return out(true);
  // … oder ein Brückentag (ein Werktag zwischen freien Tagen, nur ohne „schulkindkonform“)
  if (cfg.bridges && !cfg.school) {
    const work = rest.filter(d => !freeAny(c, d));
    if (work.length === 1 && rest.some(d => !isWeekend(d) && freeAny(c, d))) return out(true);
  }
  // … oder in den Ferien (schulkindkonform, Ferien nicht gemieden): jeder Starttag, Urlaub für Berufstätige
  if (cfg.school && cfg.ferien !== "avoid" && c.kidRegions.length && rest.every(d => c.kidRegions.every(r => !schoolDay(c, r, d)))
    && rest.some(d => c.kidRegions.some(r => ferien(c, r, d)))) return out(true);
  return out(false);
}

/** Zeiträume mit der gewünschten Zahl an Nächten, die passen (Starttage im Zeitraum) */
export function fittingStarts(days: string[], nights: number, last: string, cfg: DaysCfg, c: CalCtx): string[] {
  return days.filter(d => { const to = addDay(d, nights); return to <= last && fits(d, to, cfg, c).ok; });
}

/** Tage, die zu mindestens einem passenden Zeitraum gehören (das Raster zeigt nur diese) */
export function usefulDays(starts: string[], nights: number): Set<string> {
  const out = new Set<string>();
  for (const s of starts) for (let i = 0; i <= nights; i++) out.add(addDay(s, i));
  return out;
}

/** Einstellungen beim Anlegen: schulkindkonform, wenn Schulkinder mitreisen */
export const defaultCfg = (c: CalCtx | null): DaysCfg => ({ days: "all", ferien: "take", ...(c?.kidRegions.length ? { school: true } : {}) });
