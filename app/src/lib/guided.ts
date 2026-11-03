/*
 * Geführte neue Reise (#672): vier Fragen (Wohin, Wann, Wer, Von wo), je eine pro Bildschirm, jede überspringbar.
 * Hier die Rechnungen ohne Oberfläche: Zeitraum aus Tagen, Monat oder Ferien (Regler mit Vorgabe erster Samstag,
 * 7 Nächte), offene Tage bzw. flexible Dauer als Vorlieben der Reise, Startorte je Familie bzw. Teil der Gruppe.
 */
import type { Home } from "./home";
import type { Household, Prefs, Traveler } from "./model";
import { hhKey } from "./model";

export type WhenMode = "days" | "month" | "hol" | "flex";
export type FlexLen = "weekend" | "week" | "twoWeeks" | "long";
/** ungefähre Dauer bei „flexibel“ in Nächten (von, bis) */
export const FLEX_NIGHTS: Record<FlexLen, [number, number]> = { weekend: [1, 3], week: [5, 8], twoWeeks: [10, 15], long: [16, 30] };
/** Vorgabe des Reglers */
export const DEFAULT_NIGHTS = 7;

export interface When {
  mode: WhenMode;
  /** Tage: Hin und Zurück */
  from?: string;
  to?: string;
  /** Monat „2027-07“, dazu Regler in Tagen ab dem Ersten; open: genaue Tage noch offen */
  month?: string;
  open?: boolean;
  /** Ferien: Beginn und Ende der Ferien, Regler in Tagen ab Beginn */
  hol?: { from: string; to: string };
  /** Regler: Hin- und Rücktag als Abstand zum Anfang (Monat bzw. Ferien) */
  a?: number;
  b?: number;
  flex?: FlexLen;
}

const DAY = 864e5;
const ok = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** Tage bis zum ersten Samstag ab diesem Tag (0 = Samstag) */
export const toSaturday = (iso: string) => (6 - new Date(`${iso}T12:00:00Z`).getUTCDay() + 7) % 7;

/** Monat „JJJJ-MM“: erster Tag und Länge des Reglers (bis zum Ersten des Folgemonats, Rückreise dort möglich) */
export function monthSpan(month: string): { start: string; max: number } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  return { start, max: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

/** Ferien: Regler vom ersten bis zum letzten Ferientag */
export const holSpan = (h: { from: string; to: string }) => ({ start: h.from, max: Math.max(1, daysBetween(h.from, h.to)) });

/** Vorgabe im Regler: ab dem ersten Samstag 7 Nächte, so weit es passt */
export function defaultRange(start: string, max: number, nights = DEFAULT_NIGHTS): [number, number] {
  const n = Math.min(nights, max);
  const a = Math.min(toSaturday(start), max - n);
  return [Math.max(0, a), Math.max(0, a) + n];
}

/** Regler sauber halten: ganze Tage, im Bereich, Rückreise mindestens einen Tag nach der Hinreise */
export function clampRange(a: number, b: number, max: number): [number, number] {
  let x = Math.max(0, Math.min(max - 1, Math.round(a)));
  let y = Math.max(1, Math.min(max, Math.round(b)));
  if (y <= x) { if (x >= max - 1) x = y - 1; else y = x + 1; }
  return [x, y];
}

/** die nächsten n Monate ab heute („JJJJ-MM“), der laufende zuerst */
export function nextMonths(today: string, n = 12): string[] {
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const out: string[] = [];
  for (let i = 0; i < n; i++) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; y++; } }
  return out;
}

/** gewählter Zeitraum; ohne feste Tage (Monat offen, flexibel, nichts gewählt) leer */
export function whenDates(w: When | undefined): { from?: string; to?: string } {
  if (!w) return {};
  if (w.mode === "days") return ok(w.from) && ok(w.to) && w.to > w.from ? { from: w.from, to: w.to } : ok(w.from) ? { from: w.from } : {};
  const span = w.mode === "month" && w.month && !w.open ? monthSpan(w.month) : w.mode === "hol" && w.hol ? holSpan(w.hol) : null;
  if (!span) return {};
  const [a, b] = w.a != null && w.b != null ? clampRange(w.a, w.b, span.max) : defaultRange(span.start, span.max);
  return { from: addDays(span.start, a), to: addDays(span.start, b) };
}

/** was ohne feste Tage bleibt, als Vorlieben der Reise: Monat bzw. ungefähre Dauer */
export function whenPrefs(w: When | undefined): Prefs {
  if (w?.mode === "month" && w.month && w.open) return { months: [+w.month.slice(5, 7)] };
  if (w?.mode === "flex" && w.flex) { const [nightsMin, nightsMax] = FLEX_NIGHTS[w.flex]; return { nightsMin, nightsMax }; }
  return {};
}

/** Wohnort für den Haushalt, wie ihn die Familien-Karte speichert */
export function homeHousehold(h: Home): Household {
  return { ...(h.plz ? { plz: h.plz } : {}), geo: { lat: h.lat, lon: h.lon, ort: h.ort }, ...(h.cc && h.cc !== "DE" ? { cc: h.cc } : {}) };
}

/**
 * Startorte: alle vom selben Ort, je Familie einer, oder Teile der Gruppe mit Personenzahl (in der Reihenfolge der
 * Reisenden). Ohne Angabe bleibt der Haushalt offen und wird später in der Reise bzw. nach der Einladung ergänzt.
 */
export type Starts =
  | { kind: "same"; home?: Home }
  | { kind: "fams"; homes: (Home | undefined)[] }
  | { kind: "parts"; parts: { home?: Home; n: number }[] };

/** Haushalte der neuen Reise mit Wohnort; region: Ferienregion aus „Wann“ für Haushalte ohne Wohnort */
export function startHouseholds(travelers: Traveler[], s: Starts, region?: string): Record<string, Household> {
  const keys = [...new Set(travelers.map(hhKey))];
  const out: Record<string, Household> = {};
  const set = (k: string, h?: Home) => { if (h) out[k] = homeHousehold(h); };
  if (s.kind === "same") keys.forEach(k => set(k, s.home));
  else if (s.kind === "fams") keys.forEach((k, i) => set(k, s.homes[i]));
  else {
    // je Person der Reihe nach: die ersten n zum ersten Startort usw.
    let i = 0;
    for (const p of s.parts) for (let j = 0; j < p.n && i < travelers.length; j++, i++) { const k = hhKey(travelers[i]); if (!out[k]) set(k, p.home); }
  }
  if (region) for (const k of keys) if (!out[k]?.geo) out[k] = { ...out[k], region };
  return out;
}

/** wie viele Personen bzw. Familien noch ohne Startort sind */
export function openStarts(s: Starts, total: number): number {
  if (s.kind === "same") return s.home ? 0 : total;
  if (s.kind === "fams") return s.homes.filter(h => !h).length;
  return Math.max(0, total - s.parts.filter(p => p.home).reduce((n, p) => n + p.n, 0));
}
