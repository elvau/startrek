import { i18n, t } from "../i18n/index.svelte";
/*
 * Flughafen- und Städteauswahl (Daten: airports.json auf der Seite, aus OurAirports, wird bei jedem Deploy erneuert).
 * Eine Stadt mit mehreren Flughäfen (Tokio, New York) sucht über alle; wer ein Kürzel wählt, sucht nur dort.
 */

/** [IATA, Name, Ort, Land, Breite, Länge, Größe l/m/s, Suchbegriffe] */
type RawAirport = [string, string, string, string, number, number, string, string];
/** [Stadt-Code, deutscher Name, englischer Name, Land, Flughäfen] */
type RawCity = [string, string, string, string, string[]];
export interface AirportData { asOf?: string; airports: RawAirport[]; cities: RawCity[] }

export interface Loc {
  /** ein Flughafen, eine Stadt mit Stadt-Code (NYC) oder alle Flughäfen im Umkreis eines Orts */
  kind: "city" | "airport" | "area";
  /** Stadt-Code (NYC), Flughafen (JFK), im Umkreis der nächste Flughafen */
  code: string;
  /** Anzeige: „Tokio“ bzw. „Haneda“ */
  name: string;
  /** Ort auf Deutsch */
  city: string;
  /** Ort auf Englisch, für Anbieter, die Städte beim Namen suchen */
  en: string;
  cc: string;
  /** alle Flughäfen, die zur Auswahl gehören */
  airports: string[];
  lat?: number;
  lon?: number;
  /** Entfernung zum gesuchten Ort (Vorschläge im Umkreis) */
  km?: number;
}

export const emptyAirports = (): AirportData => ({ airports: [], cities: [] });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss").trim();

const names = new Map<string, Intl.DisplayNames>();
/** Ländername auf Deutsch („HR“ → „Kroatien“) */
export function countryName(cc: string): string {
  try {
    const l = i18n.lang;
    if (!names.has(l)) names.set(l, new Intl.DisplayNames([l], { type: "region" }));
    return names.get(l)!.of(cc) || cc;
  } catch { return cc; }
}

const fromAirport = (a: RawAirport): Loc => ({ kind: "airport", code: a[0], name: a[1], city: a[2], en: a[2], cc: a[3], airports: [a[0]], lat: a[4], lon: a[5] });
// Stadtname deutsch nur in der deutschen Oberfläche, sonst englisch
const fromCity = (c: RawCity): Loc => { const n = i18n.lang === "de" ? c[1] : c[2]; return { kind: "city", code: c[0], name: n, city: n, en: c[2], cc: c[3], airports: c[4] }; };

/** Code nachschlagen: Stadt-Code zuerst (TYO), dann Flughafen (HND) */
export function locOf(d: AirportData, code: string, prefer: "city" | "airport" = "city"): Loc | null {
  const c = code.trim().toUpperCase();
  const city = d.cities.find(x => x[0] === c), ap = d.airports.find(x => x[0] === c);
  if (prefer === "airport" && ap) return fromAirport(ap);
  return city ? fromCity(city) : ap ? fromAirport(ap) : null;
}

/**
 * Vorschläge zu einer Eingabe: Städte mit mehreren Flughäfen zuerst, dann Flughäfen (große vor kleinen).
 * Treffer auf Code, Ort, Flughafenname, Stichwörter und Land.
 */
export function searchLocs(d: AirportData, text: string, n = 8): Loc[] {
  const s = norm(text);
  if (!s) return [];
  const up = text.trim().toUpperCase();
  const scored: [number, Loc][] = [];
  const score = (fields: string[], code: string, size: number): number => {
    if (code === up) return 0;
    const f = fields.map(norm);
    if (f[0] === s) return 1;
    if (f[0].startsWith(s)) return 2;
    if (f.some(x => x.startsWith(s) || x.includes(" " + s) || x.includes(", " + s))) return 3 + size;
    if (s.length >= 3 && f.some(x => x.includes(s))) return 6 + size;
    return -1;
  };
  for (const c of d.cities) {
    const k = score([c[1], c[2], countryName(c[3])], c[0], 0);
    if (k >= 0) scored.push([k - 0.5, fromCity(c)]);
  }
  for (const a of d.airports) {
    const k = score([a[2], a[1], a[7], countryName(a[3])], a[0], "lms".indexOf(a[6]));
    if (k >= 0) scored.push([k, fromAirport(a)]);
  }
  // Flughäfen einer vorgeschlagenen Stadt direkt dahinter
  scored.sort((a, b) => a[0] - b[0]);
  const out: Loc[] = [];
  for (const [, l] of scored) {
    if (out.some(o => o.code === l.code && o.kind === l.kind)) continue;
    out.push(l);
    if (l.kind === "city") for (const code of l.airports) { const ap = d.airports.find(x => x[0] === code); if (ap && !out.some(o => o.code === code && o.kind === "airport")) out.push(fromAirport(ap)); }
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}

/**
 * Freitext wie bisher („Split“, „SPU“, „Tokio“) in eine Auswahl verwandeln:
 * genauer Code, sonst eine Stadt oder der einzige/größte Flughafen dieses Orts.
 */
export function resolveLoc(d: AirportData, text: string, cc?: string | null): Loc | null {
  const t = text.split(",")[0].trim();
  if (!t) return null;
  if (/^[A-Za-z]{3}$/.test(t)) { const l = locOf(d, t); if (l) return l; }
  const s = norm(t);
  const city = d.cities.find(c => (norm(c[1]) === s || norm(c[2]) === s) && (!cc || c[3] === cc));
  if (city) return fromCity(city);
  const aps = d.airports.filter(a => (norm(a[2]) === s || norm(a[1]) === s) && (!cc || a[3] === cc));
  return aps.length ? fromAirport(aps[0]) : null;
}

/** Text im Eingabefeld für eine Auswahl */
export const locLabel = (l: Loc) =>
  l.kind === "city" ? t("loc.cityLabel", { name: l.name, n: l.airports.length })
  : l.kind === "area" ? t("loc.areaLabel", { name: l.city, list: l.airports.join(", ") })
  : `${l.code} · ${l.city === l.name ? l.name : `${l.city}, ${l.name}`}`;

export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Flughäfen um einen Punkt, nächste zuerst (kleine Flughäfen nur, wenn es sonst zu wenige gibt) */
export function airportsNear(d: AirportData, p: { lat: number; lon: number }, maxKm = 150, n = 6): Loc[] {
  const all = d.airports.map(a => ({ ...fromAirport(a), km: Math.round(kmBetween(p, { lat: a[4], lon: a[5] })), size: a[6] })).filter(a => a.km <= maxKm);
  const big = all.filter(a => a.size !== "s");
  return (big.length >= 2 ? big : all).sort((a, b) => a.km - b.km).slice(0, n).map(({ size: _s, ...l }) => l);
}

/** „alle Flughäfen im Umkreis“ eines Orts als eine Auswahl (nur, wenn es mindestens zwei gibt) */
export function areaAround(d: AirportData, place: { name: string; lat: number; lon: number; cc?: string }, maxKm = 150, n = 6): Loc | null {
  const near = airportsNear(d, place, maxKm, n);
  if (near.length < 2) return null;
  return { kind: "area", code: near[0].code, name: t("loc.areaName", { name: place.name }), city: place.name, en: place.name, cc: place.cc || near[0].cc, airports: near.map(a => a.code), lat: place.lat, lon: place.lon };
}

/* ---------- Laden (einmal pro Sitzung) ---------- */

let loading: Promise<void> | undefined;
export function loadAirports(d: AirportData, fetchFn: typeof fetch = fetch): Promise<void> {
  const b = ((import.meta.env?.BASE_URL as string | undefined) || "/").replace(/neu\/?$/, "");
  loading ??= fetchFn(b + "airports.json").then(r => (r.ok ? r.json() : null)).then((j: AirportData | null) => {
    if (j?.airports) { d.airports = j.airports; d.cities = j.cities || []; d.asOf = j.asOf; }
  }).catch(() => { loading = undefined; });
  return loading;
}
