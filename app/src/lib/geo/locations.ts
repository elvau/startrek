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
  kind: "city" | "airport";
  /** Stadt-Code (NYC) oder Flughafen (JFK) */
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
}

export const emptyAirports = (): AirportData => ({ airports: [], cities: [] });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss").trim();

let names: Intl.DisplayNames | null = null;
/** Ländername auf Deutsch („HR“ → „Kroatien“) */
export function countryName(cc: string): string {
  try { names ??= new Intl.DisplayNames(["de"], { type: "region" }); return names.of(cc) || cc; } catch { return cc; }
}

const fromAirport = (a: RawAirport): Loc => ({ kind: "airport", code: a[0], name: a[1], city: a[2], en: a[2], cc: a[3], airports: [a[0]], lat: a[4], lon: a[5] });
const fromCity = (c: RawCity): Loc => ({ kind: "city", code: c[0], name: c[1], city: c[1], en: c[2], cc: c[3], airports: c[4] });

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
export const locLabel = (l: Loc) => (l.kind === "city" ? `${l.name} (alle ${l.airports.length} Flughäfen)` : `${l.code} · ${l.city === l.name ? l.name : `${l.city}, ${l.name}`}`);

/* ---------- Laden (einmal pro Sitzung) ---------- */

let loading: Promise<void> | undefined;
export function loadAirports(d: AirportData, fetchFn: typeof fetch = fetch): Promise<void> {
  const b = ((import.meta.env?.BASE_URL as string | undefined) || "/").replace(/neu\/?$/, "");
  loading ??= fetchFn(b + "airports.json").then(r => (r.ok ? r.json() : null)).then((j: AirportData | null) => {
    if (j?.airports) { d.airports = j.airports; d.cities = j.cities || []; d.asOf = j.asOf; }
  }).catch(() => { loading = undefined; });
  return loading;
}
