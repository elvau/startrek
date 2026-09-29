/*
 * Orte und Flughäfen aus den Daten des Artefakts (world.json, packs.json, places/pX.json auf der Seite):
 * Flughafen nachschlagen, Orte in der Nähe, englischer Suchname für Booking.com und Trivago.
 */

type WorldCity = [string, number, number, string?, string?];
interface WorldCountry { k: string; l: string; en: string; cities: WorldCity[]; aps?: [string, string, number, number, string?][]; cur?: string; rate?: number; pli?: number }
interface PackCity { n: string; en?: string; lat: number; lon: number; alias?: string[]; top?: number; food?: number }
interface Pack { k: string; cur?: string; airports: { iata: string; n: string; lat: number; lon: number }[]; cities: PackCity[]; food?: Record<string, number>; foodNote?: Record<string, string> }

export interface GeoData {
  world: WorldCountry[];
  packs: Record<string, Pack>;
  /** Orte ab 2000 Einwohnern je Land: [Name, Breite, Länge, Insel?] */
  places: Record<string, [string, number, number, string?][]>;
}

export interface Airport { code: string; name: string; lat: number; lon: number; cc: string }
export interface Place { name: string; en?: string; lat: number; lon: number; cc: string; km: number; top?: boolean }

export const emptyGeo = (): GeoData => ({ world: [], packs: {}, places: {} });

export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function airportOf(g: GeoData, code: string): Airport | null {
  const c = code.toUpperCase();
  for (const p of Object.values(g.packs)) {
    const a = p.airports.find(x => x.iata === c);
    if (a) return { code: c, name: a.n, lat: a.lat, lon: a.lon, cc: p.k };
  }
  for (const w of g.world) {
    const a = (w.aps || []).find(x => x[0] === c);
    if (a) return { code: c, name: a[1], lat: a[2], lon: a[3], cc: w.k };
  }
  return null;
}

/** Länderkürzel aus deutschem oder englischem Namen („Kroatien“ → HR) */
export function ccOf(g: GeoData, country?: string): string | null {
  if (!country) return null;
  const n = norm(country);
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  return g.world.find(w => norm(w.l) === n || norm(w.en) === n)?.k ?? null;
}

/** alle bekannten Orte eines Landes (Pakete mit englischem Namen zuerst, dann Weltdaten, dann kleinere Orte) */
function citiesOf(g: GeoData, cc: string): Omit<Place, "km">[] {
  const out: Omit<Place, "km">[] = [], seen = new Set<string>();
  const add = (p: Omit<Place, "km">) => { const k = norm(p.name); if (!seen.has(k)) { seen.add(k); out.push(p); } };
  g.packs[cc]?.cities.forEach(c => add({ name: c.n, en: c.en, lat: c.lat, lon: c.lon, cc, top: !!c.top }));
  g.world.find(w => w.k === cc)?.cities.forEach(c => add({ name: c[0], en: c[3] || undefined, lat: c[1], lon: c[2], cc, top: true }));
  g.places[cc]?.forEach(c => add({ name: c[0], lat: c[1], lon: c[2], cc }));
  return out;
}

/** Orte in der Nähe eines Flughafens, nächste zuerst */
export function placesNear(g: GeoData, ap: Airport, n = 5, maxKm = 40): Place[] {
  return citiesOf(g, ap.cc).map(c => ({ ...c, km: kmBetween(ap, c) })).filter(c => c.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, n);
}

/** Vorschlag für eine Nacht am Flughafen: bekannter Ort (aus Paketen oder Weltdaten) bis 20 km, sonst der nächste Ort */
export function stayNear(g: GeoData, ap: Airport): Place | null {
  const known = citiesOf(g, ap.cc).filter(c => c.top !== undefined).map(c => ({ ...c, km: kmBetween(ap, c) })).filter(c => c.km <= 20).sort((a, b) => a.km - b.km)[0];
  return known || placesNear(g, ap, 1)[0] || null;
}

/** wie im Artefakt: nächster bekannter Ort zum Flughafen (größere Orte zählen näher), höchstens 60 km */
export function cityForAirport(g: GeoData, ap: Airport): Place | null {
  // nur Orte aus Paketen und Weltdaten (nicht jedes Dorf), wichtige Orte zählen näher
  const w = (c: Place) => (c.top ? c.km / 1.5 : c.km);
  const cand = citiesOf(g, ap.cc).filter(c => c.top !== undefined).map(c => ({ ...c, km: kmBetween(ap, c) }));
  const best = cand.sort((a, b) => w(a) - w(b))[0];
  return best && best.km < 60 ? best : null;
}

/** Ort nachschlagen (Name oder Alias) */
export function findCity(g: GeoData, name: string, cc?: string | null): Omit<Place, "km"> | null {
  const s = norm(name.split(",")[0]);
  if (!s) return null;
  const ccs = cc ? [cc] : [...new Set([...Object.keys(g.packs), ...g.world.map(w => w.k)])];
  for (const k of ccs) {
    const pc = g.packs[k]?.cities.find(c => norm(c.n) === s || norm(c.en || "") === s || (c.alias || []).some(a => norm(a) === s));
    if (pc) return { name: pc.n, en: pc.en, lat: pc.lat, lon: pc.lon, cc: k, top: !!pc.top };
    const c = citiesOf(g, k).find(x => norm(x.name) === s || norm(x.en || "") === s);
    if (c) return c;
  }
  return null;
}

/** Suchbegriff für Booking.com und Trivago wie im Artefakt: englischer Ortsname und Land („Split“, „Croatia“) */
export function searchParts(g: GeoData, place: string, cc?: string | null): { place: string; country?: string } {
  const [name, given] = place.split(",").map(x => x.trim());
  const c = findCity(g, name, cc);
  const k = c?.cc || cc;
  const land = given || (k ? g.world.find(w => w.k === k)?.en : undefined);
  return { place: c?.en || name, ...(land ? { country: land } : {}) };
}

/** Fahrzeit grob wie im Artefakt: bis 100 km ca. 0,4 h + km/70, sonst Bahn/Auto ca. 0,6 h + km/110 */
export const travelHours = (km: number) => (km <= 100 ? 0.4 + km / 70 : 0.6 + km / 110);

/* ---------- Laden (einmal pro Sitzung, Orte nur für das gebrauchte Land) ---------- */

/** Daten liegen neben der App (world.json, packs.json, places/) */
const base = () => (import.meta.env?.BASE_URL as string | undefined) || "/";
const bucket = (cc: string) => ((cc.charCodeAt(0) * 31 + cc.charCodeAt(1)) % 16).toString(16);
const cache: { core?: Promise<void>; buckets: Record<string, Promise<void>> } = { buckets: {} };

export async function loadGeo(g: GeoData, ccs: string[], fetchFn: typeof fetch = fetch): Promise<void> {
  const json = (u: string) => fetchFn(base() + u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  cache.core ??= Promise.all([json("world.json"), json("packs.json")]).then(([w, p]) => {
    if (w?.countries) g.world = w.countries;
    if (p) g.packs = p;
  });
  await cache.core;
  await Promise.all(ccs.filter(cc => /^[A-Z]{2}$/.test(cc)).map(cc => {
    const b = bucket(cc);
    cache.buckets[b] ??= json(`places/p${b}.json`).then(j => { if (j) Object.assign(g.places, j); });
    return cache.buckets[b];
  }));
}

/* ---------- Auswahl im Reise-Editor ---------- */

/** alle Länder mit deutschem Namen, alphabetisch */
export const countryNames = (g: GeoData): string[] => g.world.map(w => w.l).sort((a, b) => a.localeCompare(b, "de"));

/** bekannte Orte eines Landes (Pakete und Weltdaten, keine Dörfer), wichtige zuerst */
export const cityNames = (g: GeoData, cc: string | null): string[] =>
  cc ? citiesOf(g, cc).filter(c => c.top !== undefined).sort((a, b) => Number(!!b.top) - Number(!!a.top) || a.name.localeCompare(b.name, "de")).map(c => c.name) : [];
