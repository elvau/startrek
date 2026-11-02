/*
 * Anreise zu einem Katalogeintrag als Richtwert (#645): aus der Luftlinie Wohnort → erster Ort (Hinreise) und letzter
 * Ort → Wohnort (Rückreise), ohne Abfrage. Bis 700 km Auto oder Bahn, darüber Flug inklusive Weg zum Flughafen.
 * Ohne Flug (Roadtrip, Camper, „ohne Flug“) immer am Boden. Kreuzfahrt (Dani, 02.11.): Anreise zum Ablegehafen und vom
 * Endhafen zurück, mit Flug eine Nacht vor dem Ablegen dazu. Der Katalogpreis ist immer Ziel + Anreise.
 */
import { kmBetween } from "../geo/places";
import { corePP, type CatalogEntry } from "./types";

export interface LatLon { lat: number; lon: number }
export type ArrivalMode = "ground" | "flight";
/** Bänder der Liste: mit Auto/Bahn erreichbar, Kurz-, Mittel-, Fernstrecke */
export type DistBand = "near" | "short" | "mid" | "far";
export const DIST_BANDS: DistBand[] = ["near", "short", "mid", "far"];

/** Stand der Richtwerte: beim Nachpflegen anheben */
export const ARRIVAL_STAND = "2026-11";
/** ab hier Flug statt Auto oder Bahn */
export const GROUND_MAX_KM = 700;
/** Richtwerte pro Person für Hin und zurück (Flug inklusive Gepäck und Weg zum Flughafen), Nebensaison */
export const ARRIVAL_PP: { upTo: number; mode: ArrivalMode; pp: number }[] = [
  { upTo: 300, mode: "ground", pp: 40 },
  { upTo: GROUND_MAX_KM, mode: "ground", pp: 90 },
  { upTo: 2000, mode: "flight", pp: 220 },
  { upTo: 4500, mode: "flight", pp: 400 },
  { upTo: 8000, mode: "flight", pp: 750 },
  { upTo: Infinity, mode: "flight", pp: 1000 }
];
/** Auto bzw. Bahn auf langen Strecken (ohne Flug): pro Person und km einfach */
export const GROUND_PP_KM = 0.13;
/** Hauptsaison: Sommerferien und Weihnachten */
export const PEAK_MONTHS = [7, 8, 12];
export const PEAK_FACTOR = 1.3;
/** Spanne um den Richtwert */
export const SPREAD = 0.35;
/** Kreuzfahrt mit Flug: eine Nacht am Hafen vor dem Ablegen, pro Person */
export const PRE_NIGHT_PP = 70;

export interface ArrivalEst {
  mode: ArrivalMode;
  /** Luftlinie Wohnort → erster Ort */
  km: number;
  band: DistBand;
  /** pro Person, Hin und zurück */
  pp: number;
  range: [number, number];
  peak: boolean;
  /** darin enthalten: Nacht vor dem Ablegen (Kreuzfahrt mit Flug) */
  preNight?: number;
}

export const bandOf = (km: number): DistBand => (km <= GROUND_MAX_KM ? "near" : km <= 2000 ? "short" : km <= 4500 ? "mid" : "far");

const r5 = (n: number) => Math.round(n / 5) * 5;

/** eine Richtung, pro Person */
function oneWay(km: number, noFly: boolean): { mode: ArrivalMode; pp: number } {
  if (noFly && km > GROUND_MAX_KM) return { mode: "ground", pp: km * GROUND_PP_KM + ARRIVAL_PP[1].pp / 2 };
  const row = ARRIVAL_PP.find(r => km <= r.upTo)!;
  return { mode: noFly ? "ground" : row.mode, pp: row.pp / 2 };
}

const hasLoc = (s?: { lat?: number; lon?: number }): s is LatLon => s?.lat != null && s?.lon != null;

/** Anreise zum Eintrag ab Wohnort; month: Reisemonat (sonst erster guter Monat) */
export function arrivalFor(e: CatalogEntry, home: LatLon, month?: number): ArrivalEst | null {
  const a = e.stops[0], b = e.stops.at(-1);
  if (!hasLoc(a)) return null;
  const noFly = !!e.noFly || e.kind === "road";
  const km = kmBetween(home, a);
  const out = oneWay(km, noFly), back = oneWay(hasLoc(b) ? kmBetween(b, home) : km, noFly);
  const mode: ArrivalMode = out.mode === "flight" || back.mode === "flight" ? "flight" : "ground";
  const m = month ?? e.months[0];
  const peak = !!m && PEAK_MONTHS.includes(m);
  let pp = (out.pp + back.pp) * (peak ? PEAK_FACTOR : 1);
  const preNight = e.kind === "cruise" && out.mode === "flight" ? PRE_NIGHT_PP : undefined;
  if (preNight) pp += preNight;
  const v = r5(pp);
  return { mode, km: Math.round(km), band: bandOf(km), pp: v, range: [r5(pp * (1 - SPREAD)), r5(pp * (1 + SPREAD))], peak, ...(preNight ? { preNight } : {}) };
}

/** Katalogpreis pro Person: Ziel + Anreise (ohne Touren); ohne Wohnort bzw. Lage nur das Ziel */
export function totalPP(e: CatalogEntry, home?: LatLon | null, month?: number): { pp: number; arrival: ArrivalEst | null } {
  const arrival = home ? arrivalFor(e, home, month) : null;
  return { pp: corePP(e) + (arrival?.pp || 0), arrival };
}

/** Zeitzone → Land (Europa und häufige Märkte): verlässlicher als die Browsersprache („de“ auch in CH und AT) */
const TZ_CC: Record<string, string> = {
  "Europe/Berlin": "DE", "Europe/Busingen": "DE", "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Paris": "FR", "Europe/Brussels": "BE",
  "Europe/Amsterdam": "NL", "Europe/Luxembourg": "LU", "Europe/Copenhagen": "DK", "Europe/Oslo": "NO", "Europe/Stockholm": "SE",
  "Europe/Helsinki": "FI", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Madrid": "ES", "Europe/Lisbon": "PT", "Europe/Rome": "IT",
  "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Budapest": "HU", "Europe/Ljubljana": "SI",
  "Europe/Zagreb": "HR", "Europe/Athens": "GR", "Europe/Bucharest": "RO", "Europe/Sofia": "BG", "Europe/Vilnius": "LT", "Europe/Riga": "LV",
  "Europe/Tallinn": "EE", "Europe/Moscow": "RU", "Europe/Istanbul": "TR", "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "Asia/Dubai": "AE", "Asia/Riyadh": "SA"
};

/**
 * Land des Betrachters ohne festen Rückfall auf Deutschland (Dani, 02.11.): Wohnort, Land aus den Vorlieben, Zeitzone,
 * Region der Browsersprache („de-CH“); sonst keins (dann Wohnort erfragen statt ab Deutschland zu sortieren).
 */
export function viewerCountry(o: { home?: { cc?: string } | null; prefsCc?: string; tz?: string; lang?: string }): string | null {
  const ok = (c?: string | null) => (c && /^[A-Z]{2}$/.test(c.toUpperCase()) ? c.toUpperCase() : null);
  return ok(o.home?.cc) || ok(o.prefsCc) || ok(o.tz ? TZ_CC[o.tz] : null) || ok((o.lang || "").split(/[-_]/)[1]) || null;
}

/** Startort: Wohnort, sonst Hauptstadt des Landes (Rückfall), sonst keiner */
export function originOf(home?: LatLon | null, cc?: string, capital?: (cc: string) => LatLon | null): LatLon | null {
  if (hasLoc(home ?? undefined)) return { lat: home!.lat, lon: home!.lon };
  return (cc && capital?.(cc)) || null;
}

/** Vorsortierung nach Luftlinie, Einträge ohne Lage ans Ende; ohne Startort unverändert */
export function sortByDistance<T extends CatalogEntry>(list: T[], home?: LatLon | null): { e: T; km: number | null; band: DistBand | null }[] {
  const rows = list.map(e => {
    const km = home && hasLoc(e.stops[0]) ? Math.round(kmBetween(home, e.stops[0])) : null;
    return { e, km, band: km == null ? null : bandOf(km) };
  });
  if (!home) return rows;
  return rows.sort((x, y) => (x.km ?? Infinity) - (y.km ?? Infinity));
}
