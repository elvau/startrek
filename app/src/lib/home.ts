/*
 * Wohnort je Land (#163, Entscheidung #335): Postleitzahlen für Deutschland (plz.txt) und europäische Länder aus GeoNames
 * (public/plz/<LAND>.txt, CC BY 4.0, scripts/plz.mjs), sonst Ort aus der Ortsliste (world.json). Ergebnis wie bisher:
 * Ort und Koordinaten für Anfahrt und Flughafensuche, dazu das Land.
 */
import { loadPlz } from "./plz";

export interface Home { cc: string; plz: string; ort: string; lat: number; lon: number }
/** Postleitzahl, Ort, Breite, Länge */
export type PostalRow = [string, string, number, number];

export const HOME_DEFAULT = "DE";
export const POSTAL_SOURCE = "GeoNames (CC BY 4.0)";

/** eine Datei je Land: „PLZ<TAB>Ort<TAB>Breite<TAB>Länge“ je Zeile */
export function parsePostal(txt: string): PostalRow[] {
  const out: PostalRow[] = [];
  for (const line of txt.split("\n")) {
    const [code, ort, lat, lon] = line.split("\t");
    if (code && ort && isFinite(+lat) && isFinite(+lon)) out.push([code, ort, +lat, +lon]);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Vorschläge zu einer angefangenen Postleitzahl oder einem Ortsnamen (Ziffern oder Buchstaben am Anfang, ohne Leerzeichen-Unterschied) */
export function suggestPostal(rows: PostalRow[], q: string, max = 6): PostalRow[] {
  const s = norm(q);
  if (!s) return [];
  const code = s.replace(/\s/g, "");
  const out: PostalRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const hit = r[0].toLowerCase().replace(/\s/g, "").startsWith(code) || norm(r[1]).startsWith(s);
    if (!hit || seen.has(`${r[0]}|${r[1]}`)) continue;
    seen.add(`${r[0]}|${r[1]}`);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

/** gekürzte Postleitzahlen (wie scripts/plz.mjs): Portugal nur „1000“ statt „1000-001“ */
export const shortCode = (cc: string, q: string) => (cc === "PT" ? q.split("-")[0] : q);

/** vollständig eingetippte Postleitzahl: genau diese, und keine längere fängt so an */
export function exactPostal(rows: PostalRow[], q: string): PostalRow | undefined {
  const code = q.toLowerCase().replace(/\s/g, "");
  if (!code) return undefined;
  const flat = (r: PostalRow) => r[0].toLowerCase().replace(/\s/g, "");
  const hit = rows.find(r => flat(r) === code);
  if (!hit || rows.some(r => flat(r) !== code && flat(r).startsWith(code))) return undefined;
  return hit;
}

export const rowHome = (cc: string, r: PostalRow): Home => ({ cc, plz: r[0], ort: r[1], lat: r[2], lon: r[3] });

/** Text für die Anzeige: „40210 Düsseldorf“, ohne PLZ nur der Ort */
export const homeText = (h?: { plz?: string; ort?: string }) => (h?.ort ? [h.plz, h.ort].filter(Boolean).join(" ") : "");

/**
 * gespeicherten Wohnort wieder auflösen (Vorlieben speichern nur PLZ bzw. Ort und Land): Postleitzahl, sonst Ort aus der
 * Liste des Landes (cities: Orte der Ortsliste, nur ohne PLZ-Daten nötig)
 */
export async function resolveHome(cc: string, q: string, cities: [string, number, number][] = [], fetchFn: typeof fetch = fetch): Promise<Home | undefined> {
  const v = q.trim();
  if (!v) return undefined;
  const rows = await loadPostal(cc, fetchFn);
  const r = rows ? exactPostal(rows, shortCode(cc, v)) || rows.find(x => norm(x[1]) === norm(v)) : undefined;
  if (r) return rowHome(cc, r);
  const c = cities.find(x => norm(x[0]) === norm(v));
  return c ? { cc, plz: "", ort: c[0], lat: c[1], lon: c[2] } : undefined;
}

const base = () => (import.meta.env?.BASE_URL as string | undefined) || "/";
let index: Promise<Record<string, number>> | undefined;
/** Länder mit Postleitzahlen (Deutschland immer) */
export function postalCountries(fetchFn: typeof fetch = fetch): Promise<Set<string>> {
  index ??= fetchFn(base() + "plz/index.json").then(r => (r.ok ? r.json() : {})).then((j: { countries?: Record<string, number> }) => j?.countries || {}).catch(() => ({}));
  return index.then(c => new Set([HOME_DEFAULT, ...Object.keys(c)]));
}

const tables = new Map<string, Promise<PostalRow[] | null>>();
/** Postleitzahlen eines Landes (einmal geladen); ohne Daten null */
export function loadPostal(cc: string, fetchFn: typeof fetch = fetch): Promise<PostalRow[] | null> {
  if (!tables.has(cc)) tables.set(cc, cc === HOME_DEFAULT
    ? loadPlz().then(m => [...m].map(([k, p]) => [k, p.ort, p.lat, p.lon] as PostalRow)).catch(() => null)
    : postalCountries(fetchFn).then(s => (s.has(cc) ? fetchFn(`${base()}plz/${cc}.txt`).then(r => (r.ok ? r.text() : "")).then(t => parsePostal(t) || null) : null)).catch(() => null));
  return tables.get(cc)!;
}
