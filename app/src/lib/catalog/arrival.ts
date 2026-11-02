/*
 * Anreise zu einem Katalogeintrag als Richtwert (#645): aus der Luftlinie Wohnort → erster Ort (Hinreise) und letzter
 * Ort → Wohnort (Rückreise), ohne Abfrage. Bis 700 km (eigene Grenze in den Vorlieben) Auto oder Bahn, darüber Flug
 * inklusive Weg zum Flughafen.
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
/** ab hier Flug statt Auto oder Bahn (Standard; eigene Grenze in den Vorlieben: Prefs.flyKm, Dani 02.11.) */
export const FLY_KM = 700;
/** Richtwerte pro Person für Hin und zurück, Nebensaison: am Boden bis 30 (Nahverkehr), 300 bzw. 700 km, Flug inklusive Gepäck und Weg zum Flughafen */
export const GROUND_PP: { upTo: number; pp: number }[] = [{ upTo: 30, pp: 10 }, { upTo: 300, pp: 40 }, { upTo: 700, pp: 90 }];
export const FLIGHT_PP: { upTo: number; pp: number }[] = [
  { upTo: 2000, pp: 220 },
  { upTo: 4500, pp: 400 },
  { upTo: 8000, pp: 750 },
  { upTo: Infinity, pp: 1000 }
];
/** Auto bzw. Bahn über 700 km (ohne Flug oder eigene Grenze höher): pro Person und km einfach, zusätzlich */
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

export interface ArrivalOpts {
  /** ab dieser Luftlinie Flug statt Auto oder Bahn (Vorlieben), sonst FLY_KM */
  flyKm?: number;
  /** Flug-Richtwerte aus geprüften Preisen (#652), Schlüssel wie flightKey; fehlt einer, gilt FLIGHT_PP */
  flights?: Record<string, number>;
}
const flyOf = (o?: ArrivalOpts) => (o?.flyKm && o.flyKm > 0 ? o.flyKm : FLY_KM);

/** Band der Liste: „near“ = am Boden erreichbar (bis zur eigenen Grenze), dann Kurz-, Mittel-, Fernstrecke */
export const bandOf = (km: number, flyKm = FLY_KM): DistBand => (km <= flyKm ? "near" : km <= 2000 ? "short" : km <= 4500 ? "mid" : "far");

const r5 = (n: number) => Math.round(n / 5) * 5;

/** am Boden, Hin und zurück pro Person; über 700 km steigt der Preis mit jedem km weiter */
export function groundPP(km: number): number {
  const row = GROUND_PP.find(r => km <= r.upTo);
  return row ? row.pp : GROUND_PP.at(-1)!.pp + 2 * (km - GROUND_PP.at(-1)!.upTo) * GROUND_PP_KM;
}
/** Flug, Hin und zurück pro Person */
export const flightPP = (km: number, table?: Record<string, number>) => { const r = FLIGHT_PP.find(x => km <= x.upTo)!; return table?.[String(r.upTo)] || r.pp; };
/** Zeile der Flug-Tabelle zu einer Entfernung („2000“ … „Infinity“), Schlüssel der geprüften Anreise-Preise */
export const flightKey = (km: number) => String(FLIGHT_PP.find(x => km <= x.upTo)!.upTo);

/** eine Richtung, pro Person */
function oneWay(km: number, noFly: boolean, flyKm: number, table?: Record<string, number>): { mode: ArrivalMode; pp: number } {
  return noFly || km <= flyKm ? { mode: "ground", pp: groundPP(km) / 2 } : { mode: "flight", pp: flightPP(km, table) / 2 };
}

const hasLoc = (s?: { lat?: number; lon?: number }): s is LatLon => s?.lat != null && s?.lon != null;

/** Anreise zum Eintrag ab Wohnort; month: Reisemonat (sonst erster guter Monat) */
export function arrivalFor(e: CatalogEntry, home: LatLon, month?: number, opts?: ArrivalOpts): ArrivalEst | null {
  const a = e.stops[0], b = e.stops.at(-1);
  if (!hasLoc(a)) return null;
  const noFly = !!e.noFly || e.kind === "road";
  const km = kmBetween(home, a);
  const fk = flyOf(opts);
  const out = oneWay(km, noFly, fk, opts?.flights), back = oneWay(hasLoc(b) ? kmBetween(b, home) : km, noFly, fk, opts?.flights);
  const mode: ArrivalMode = out.mode === "flight" || back.mode === "flight" ? "flight" : "ground";
  const m = month ?? e.months[0];
  const peak = !!m && PEAK_MONTHS.includes(m);
  let pp = (out.pp + back.pp) * (peak ? PEAK_FACTOR : 1);
  const preNight = e.kind === "cruise" && out.mode === "flight" ? PRE_NIGHT_PP : undefined;
  if (preNight) pp += preNight;
  const v = r5(pp);
  return { mode, km: Math.round(km), band: bandOf(km, fk), pp: v, range: [r5(pp * (1 - SPREAD)), r5(pp * (1 + SPREAD))], peak, ...(preNight ? { preNight } : {}) };
}

/** Katalogpreis pro Person: Ziel + Anreise (ohne Touren); ohne Wohnort bzw. Lage nur das Ziel */
export function totalPP(e: CatalogEntry, home?: LatLon | null, month?: number, opts?: ArrivalOpts): { pp: number; arrival: ArrivalEst | null } {
  const arrival = home ? arrivalFor(e, home, month, opts) : null;
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
export function sortByDistance<T extends CatalogEntry>(list: T[], home?: LatLon | null, opts?: ArrivalOpts): { e: T; km: number | null; band: DistBand | null }[] {
  const rows = list.map(e => {
    const km = home && hasLoc(e.stops[0]) ? Math.round(kmBetween(home, e.stops[0])) : null;
    return { e, km, band: km == null ? null : bandOf(km, flyOf(opts)) };
  });
  if (!home) return rows;
  return rows.sort((x, y) => (x.km ?? Infinity) - (y.km ?? Infinity));
}
