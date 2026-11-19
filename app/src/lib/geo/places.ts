/*
 * Orte und Flughäfen aus den Daten des Artefakts (world.json, packs.json, places/pX.json auf der Seite):
 * Flughafen nachschlagen, Orte in der Nähe, englischer Suchname für Booking.com und Trivago.
 */

type WorldCity = [string, number, number, string?, string?];
interface WorldCountry { k: string; l: string; en: string; cities: WorldCity[]; cap?: string; aps?: [string, string, number, number, string?][]; cur?: string; rate?: number; pli?: number }
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

/** Hauptstadt eines Landes (z. B. wenn bei einem Event nur das Land bekannt ist: Sabah FK → Baku) */
export function capitalOf(g: GeoData, cc: string): { name: string; lat: number; lon: number } | null {
  const w = g.world.find(x => x.k === cc);
  const c = w?.cap ? w.cities.find(x => x[0] === w.cap || x[3] === w.cap) : null;
  return c ? { name: c[0], lat: c[1], lon: c[2] } : null;
}

/** Länderkürzel aus deutschem oder englischem Namen („Kroatien“ → HR) */
export function ccOf(g: GeoData, country?: string): string | null {
  if (!country) return null;
  const n = norm(country);
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  return g.world.find(w => norm(w.l) === n || norm(w.en) === n)?.k ?? localNames(g).get(n) ?? null;
}

/** Ländernamen in den Sprachen der App („Croacia“, „Chorwacja“, „Хорватия“ → HR), aus Intl.DisplayNames */
const LANGS = ["de", "en", "es", "fr", "pl", "ru", "ar"];
let names: { n: number; map: Map<string, string> } | null = null;
function localNames(g: GeoData): Map<string, string> {
  if (names?.n === g.world.length) return names.map;
  const map = new Map<string, string>();
  try {
    for (const l of LANGS) {
      const dn = new Intl.DisplayNames([l], { type: "region" });
      for (const w of g.world) { const x = dn.of(w.k); if (x && x !== w.k) map.set(norm(x), w.k); }
    }
  } catch { /* ältere Browser ohne DisplayNames: nur deutsch und englisch */ }
  names = { n: g.world.length, map };
  return map;
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

/** nächster Ort (ab 2000 Einwohnern bzw. aus den Paketen) zu einem Punkt im Land, höchstens maxKm entfernt */
export function townNear(g: GeoData, p: { lat: number; lon: number }, cc: string, maxKm = 25): Place | null {
  let best: Place | null = null;
  for (const c of citiesOf(g, cc)) {
    const km = kmBetween(p, c);
    if (km <= maxKm && (!best || km < best.km)) best = { ...c, km };
  }
  return best;
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

/** Vorschlag der Stadtsuche: Ort mit Land (deutscher Name zur Anzeige, englischer für die Suche) */
export interface CityHit { name: string; en?: string; cc: string; land: string; landEn: string; lat: number; lon: number; top: boolean }

/**
 * Stadtsuche für Unterkünfte: Orte, deren Name (deutsch oder englisch) mit der Eingabe beginnt.
 * Zuerst die Länder der Reise (dort auch kleinere Orte), dann bekannte Städte weltweit; größere vor kleineren.
 */
export function suggestCities(g: GeoData, q: string, prefer: string[] = [], max = 8): CityHit[] {
  const s = norm(q.split(",")[0]);
  if (s.length < 2) return [];
  const out: (CityHit & { rank: number })[] = [], seen = new Set<string>();
  const hit = (p: Omit<Place, "km">, rank: number) => {
    const n = norm(p.name), e = norm(p.en || "");
    if (!n.startsWith(s) && !e.startsWith(s)) return;
    const k = `${p.cc}|${n}`;
    if (seen.has(k)) return;
    seen.add(k);
    const w = g.world.find(x => x.k === p.cc);
    out.push({ name: p.name, ...(p.en ? { en: p.en } : {}), cc: p.cc, land: w?.l || p.cc, landEn: w?.en || p.cc, lat: p.lat, lon: p.lon, top: !!p.top,
      rank: rank * 2 + (p.top ? 0 : 1) - (n === s || e === s ? 0.5 : 0) });
  };
  for (const cc of prefer) citiesOf(g, cc).forEach(p => hit(p, 0));
  for (const w of g.world) if (!prefer.includes(w.k)) w.cities.forEach(c => hit({ name: c[0], en: c[3] || undefined, lat: c[1], lon: c[2], cc: w.k, top: true }, 1));
  return out.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length).slice(0, max).map(({ rank: _r, ...h }) => h);
}

/** Suchbegriff für Booking.com und Trivago wie im Artefakt: englischer Ortsname und Land („Split“, „Croatia“) */
export function searchParts(g: GeoData, place: string, cc?: string | null): { place: string; country?: string } {
  const [name, given] = place.split(",").map(x => x.trim());
  // Land dazugeschrieben (aus der Stadtsuche, auch deutsch: „Cusco, Peru“, „Rio de Janeiro, Brasilien“): dort suchen, englisch weitergeben
  const gk = given ? ccOf(g, given) : null;
  const c = findCity(g, name, gk || cc);
  const k = c?.cc || gk || cc;
  // Teil nach dem Komma nur als Land, wenn er eins ist (nicht Gemeinde, Insel oder Region wie „Mallorca“)
  const land = k ? g.world.find(w => w.k === k)?.en : undefined;
  return { place: c?.en || name, ...(land ? { country: land } : {}) };
}

/* ---------- Ort genauer auflösen (#679): gleichnamige Orte, Landkreis, Bundesland, PLZ, Urlaubsregionen ---------- */

/** Postleitzahl, Ort, Breite, Länge (plz.txt bzw. plz/<LAND>.txt, wie worker/src/home.ts) */
export type PostalRow = [string, string, number, number];

/** Urlaubsregion: Mittelpunkt und Umkreis in km (grob, Treffer weiter weg gehören nicht dazu) */
interface Area { n: string[]; en: string; cc: string; lat: number; lon: number; km: number }
const AREAS: Area[] = [
  { n: ["Bayerischer Wald", "Bayrischer Wald"], en: "Bavarian Forest", cc: "DE", lat: 49.0, lon: 13.2, km: 45 },
  { n: ["Schwarzwald"], en: "Black Forest", cc: "DE", lat: 48.3, lon: 8.2, km: 70 },
  { n: ["Allgäu", "Allgaeu"], en: "Allgäu", cc: "DE", lat: 47.7, lon: 10.3, km: 45 },
  { n: ["Harz"], en: "Harz", cc: "DE", lat: 51.75, lon: 10.7, km: 40 },
  { n: ["Eifel"], en: "Eifel", cc: "DE", lat: 50.35, lon: 6.7, km: 50 },
  { n: ["Sauerland"], en: "Sauerland", cc: "DE", lat: 51.2, lon: 8.2, km: 45 },
  { n: ["Spreewald"], en: "Spreewald", cc: "DE", lat: 51.85, lon: 14.0, km: 25 },
  { n: ["Sächsische Schweiz", "Saechsische Schweiz"], en: "Saxon Switzerland", cc: "DE", lat: 50.92, lon: 14.15, km: 20 },
  { n: ["Erzgebirge"], en: "Ore Mountains", cc: "DE", lat: 50.55, lon: 13.0, km: 50 },
  { n: ["Thüringer Wald", "Thueringer Wald"], en: "Thuringian Forest", cc: "DE", lat: 50.65, lon: 10.8, km: 45 },
  { n: ["Rhön", "Rhoen"], en: "Rhön", cc: "DE", lat: 50.45, lon: 9.95, km: 30 },
  { n: ["Odenwald"], en: "Odenwald", cc: "DE", lat: 49.6, lon: 9.0, km: 35 },
  { n: ["Pfälzerwald", "Pfälzer Wald"], en: "Palatinate Forest", cc: "DE", lat: 49.3, lon: 7.85, km: 35 },
  { n: ["Fichtelgebirge"], en: "Fichtel Mountains", cc: "DE", lat: 50.03, lon: 11.85, km: 25 },
  { n: ["Fränkische Schweiz", "Fraenkische Schweiz"], en: "Franconian Switzerland", cc: "DE", lat: 49.78, lon: 11.3, km: 25 },
  { n: ["Berchtesgadener Land"], en: "Berchtesgaden", cc: "DE", lat: 47.65, lon: 12.95, km: 25 },
  { n: ["Chiemgau"], en: "Chiemgau", cc: "DE", lat: 47.85, lon: 12.5, km: 30 },
  { n: ["Bodensee"], en: "Lake Constance", cc: "DE", lat: 47.6, lon: 9.4, km: 45 },
  { n: ["Lüneburger Heide", "Lueneburger Heide"], en: "Lüneburg Heath", cc: "DE", lat: 53.1, lon: 10.0, km: 45 },
  { n: ["Mecklenburgische Seenplatte"], en: "Mecklenburg Lake District", cc: "DE", lat: 53.4, lon: 12.8, km: 50 },
  { n: ["Ostfriesland"], en: "East Frisia", cc: "DE", lat: 53.4, lon: 7.5, km: 50 },
  { n: ["Zillertal"], en: "Zillertal", cc: "AT", lat: 47.2, lon: 11.85, km: 25 },
  { n: ["Salzkammergut"], en: "Salzkammergut", cc: "AT", lat: 47.7, lon: 13.6, km: 40 },
  { n: ["Südtirol", "Suedtirol", "Alto Adige"], en: "South Tyrol", cc: "IT", lat: 46.65, lon: 11.4, km: 80 },
  { n: ["Toskana", "Toscana"], en: "Tuscany", cc: "IT", lat: 43.4, lon: 11.1, km: 110 },
  { n: ["Istrien", "Istra"], en: "Istria", cc: "HR", lat: 45.2, lon: 13.9, km: 50 },
  { n: ["Provence"], en: "Provence", cc: "FR", lat: 43.9, lon: 5.6, km: 100 }
];

/** Bundesländer (Deutschland, Österreich) als grobe Rechtecke [Süd, West, Nord, Ost]: nur zur Wahl unter gleichnamigen Orten */
const STATES: { n: string[]; cc: string; box: [number, number, number, number] }[] = [
  { n: ["Baden-Württemberg", "BW"], cc: "DE", box: [47.5, 7.5, 49.8, 10.5] },
  { n: ["Bayern", "Bavaria", "BY"], cc: "DE", box: [47.27, 8.97, 50.57, 13.84] },
  { n: ["Berlin"], cc: "DE", box: [52.33, 13.08, 52.68, 13.77] },
  { n: ["Brandenburg", "BB"], cc: "DE", box: [51.36, 11.27, 53.56, 14.77] },
  { n: ["Bremen"], cc: "DE", box: [53.01, 8.48, 53.61, 8.99] },
  { n: ["Hamburg"], cc: "DE", box: [53.39, 9.73, 53.75, 10.33] },
  { n: ["Hessen", "Hesse", "HE"], cc: "DE", box: [49.39, 7.77, 51.66, 10.24] },
  { n: ["Mecklenburg-Vorpommern", "MV"], cc: "DE", box: [53.11, 10.59, 54.69, 14.41] },
  { n: ["Niedersachsen", "Lower Saxony", "NI"], cc: "DE", box: [51.29, 6.65, 53.89, 11.6] },
  { n: ["Nordrhein-Westfalen", "North Rhine-Westphalia", "NRW"], cc: "DE", box: [50.32, 5.87, 52.53, 9.46] },
  { n: ["Rheinland-Pfalz", "Rhineland-Palatinate", "RP", "RLP"], cc: "DE", box: [48.97, 6.11, 50.94, 8.51] },
  { n: ["Saarland", "SL"], cc: "DE", box: [49.11, 6.36, 49.64, 7.4] },
  { n: ["Sachsen", "Saxony", "SN"], cc: "DE", box: [50.17, 11.87, 51.69, 15.04] },
  { n: ["Sachsen-Anhalt", "Saxony-Anhalt", "ST"], cc: "DE", box: [50.94, 10.56, 53.04, 13.19] },
  { n: ["Schleswig-Holstein", "SH"], cc: "DE", box: [53.36, 7.87, 55.06, 11.31] },
  { n: ["Thüringen", "Thuringia", "TH"], cc: "DE", box: [50.2, 9.88, 51.65, 12.65] },
  { n: ["Burgenland"], cc: "AT", box: [46.83, 15.99, 48.12, 17.16] },
  { n: ["Kärnten", "Carinthia"], cc: "AT", box: [46.37, 12.66, 47.13, 15.07] },
  { n: ["Niederösterreich", "Lower Austria"], cc: "AT", box: [47.42, 14.45, 49.02, 17.07] },
  { n: ["Oberösterreich", "Upper Austria"], cc: "AT", box: [47.46, 12.75, 48.77, 14.99] },
  { n: ["Salzburg"], cc: "AT", box: [46.94, 12.08, 48.04, 13.99] },
  { n: ["Steiermark", "Styria"], cc: "AT", box: [46.61, 13.56, 47.83, 16.17] },
  { n: ["Tirol", "Tyrol"], cc: "AT", box: [46.65, 10.1, 47.75, 12.97] },
  { n: ["Vorarlberg"], cc: "AT", box: [46.84, 9.53, 47.6, 10.24] },
  { n: ["Wien", "Vienna"], cc: "AT", box: [48.12, 16.18, 48.33, 16.58] }
];

/** Zusatz wie „Landkreis Cham“, „Lkr. Cham“, „bei Cham“ → „Cham“ */
const DISTRICT = /^(?:landkreis|land-?kreis|lkr\.?|lk|kreis|kr\.?|bezirk|gemeinde|region|kanton|provinz|county|district|municipality|near|bei|nahe|im|in|am)\s+/i;

export interface Resolved {
  /** Suchbegriff (englisch, soweit bekannt) */
  place: string;
  country?: string;
  cc?: string;
  lat?: number;
  lon?: number;
  /** Urlaubsregion: Treffer weiter als so viele km vom Mittelpunkt fallen weg */
  areaKm?: number;
  /** es gibt gleichnamige Orte: Suche um lat/lon statt über den Namen */
  pinned?: boolean;
  /** gleichnamige Orte, unter denen ohne Zusatz gewählt wurde (Hinweis statt stiller Wahl) */
  others?: string[];
}

/** gleichnamige Orte im Land: Pakete, Weltdaten, kleinere Orte und Postleitzahlen; Treffer näher als 8 km zählen einmal */
function sameName(g: GeoData, s: string, cc: string, postal: PostalRow[]): (Omit<Place, "km"> & { plz?: string })[] {
  const out: (Omit<Place, "km"> & { plz?: string })[] = [];
  const add = (p: Omit<Place, "km"> & { plz?: string }) => { if (!out.some(o => kmBetween(o, p) < 8)) out.push(p); };
  g.packs[cc]?.cities.forEach(c => { if (norm(c.n) === s || norm(c.en || "") === s || (c.alias || []).some(a => norm(a) === s)) add({ name: c.n, en: c.en, lat: c.lat, lon: c.lon, cc, top: !!c.top }); });
  g.world.find(w => w.k === cc)?.cities.forEach(c => { if (norm(c[0]) === s || norm(c[3] || "") === s) add({ name: c[0], en: c[3] || undefined, lat: c[1], lon: c[2], cc, top: true }); });
  g.places[cc]?.forEach(c => { if (norm(c[0]) === s) add({ name: c[0], lat: c[1], lon: c[2], cc }); });
  postal.forEach(r => { if (norm(r[1]) === s) add({ name: r[1], lat: r[2], lon: r[3], cc, plz: r[0] }); });
  return out;
}

/**
 * Ort für die Unterkunftssuche auflösen (#679): wie searchParts, dazu
 * - Zusatz nach dem Komma: Land, Postleitzahl, Bundesland oder Landkreis bzw. Nachbarort („Rimbach, Landkreis Cham“),
 * - gleichnamige Orte (auch aus den Postleitzahlen des Landes): Wahl über den Zusatz, sonst der erste und Hinweis (others),
 * - Urlaubsregionen („Bayerischer Wald“): Mittelpunkt und Umkreis.
 */
export function resolvePlace(g: GeoData, place: string, cc?: string | null, postal: PostalRow[] = []): Resolved {
  const [name, ...rest] = place.split(",").map(x => x.trim()).filter(Boolean);
  if (!name) return { place: place.trim() };
  let k = cc || null, code = "", state: (typeof STATES)[number] | undefined, near = "";
  for (const r of rest) {
    const c = /^(?:[A-Z]{1,2}-)?(\d{4,5})$/i.exec(r.replace(/\s/g, ""));
    const st = STATES.find(x => x.n.some(n => norm(n) === norm(r)));
    if (c) code = c[1];
    else if (st) { state = st; k = st.cc; }
    else if (ccOf(g, r)) k = ccOf(g, r);
    else near = r.replace(DISTRICT, "").trim();
  }
  // PLZ vor dem Namen („93485 Rimbach“)
  const lead = /^(\d{4,5})\s+(\D.+)$/.exec(name);
  const s = norm(lead ? lead[2] : name);
  if (lead) code = lead[1];
  const landEn = (x?: string | null) => (x ? g.world.find(w => w.k === x)?.en : undefined);

  // Urlaubsregion (nur wenn kein Ort so heißt)
  const area = AREAS.find(a => (!k || a.cc === k) && (a.n.some(n => norm(n) === s) || norm(a.en) === s));
  if (area && !findCity(g, name, area.cc)) return { place: area.en, country: landEn(area.cc), cc: area.cc, lat: area.lat, lon: area.lon, areaKm: area.km };

  const base = (c: Omit<Place, "km"> | null, kk: string | null | undefined): Resolved => {
    const land = landEn(c?.cc || kk);
    return { place: c?.en || (lead ? lead[2] : name), ...(land ? { country: land } : {}), ...((c?.cc || kk) ? { cc: (c?.cc || kk)! } : {}), ...(c ? { lat: c.lat, lon: c.lon } : {}) };
  };
  if (!k) {
    const f = findCity(g, lead ? lead[2] : name);
    if (!f) return base(null, null);
    k = f.cc;
  }

  const cands = sameName(g, s, k, postal);
  if (!cands.length) {
    // nicht bekannt: Postleitzahl allein gibt die Lage
    const pc = code ? postal.find(r => r[0] === code) : undefined;
    return pc ? { ...base(null, k), lat: pc[2], lon: pc[3], pinned: true } : base(findCity(g, name, k), k);
  }
  const at = (p: { lat: number; lon: number }, max: number) => cands.map(c => ({ c, km: kmBetween(c, p) })).filter(x => x.km <= max).sort((a, b) => a.km - b.km)[0]?.c;
  let pick: (typeof cands)[number] | undefined;
  if (code) {
    pick = cands.find(c => c.plz === code);
    const pc = postal.find(r => r[0] === code);
    if (!pick && pc) pick = at({ lat: pc[2], lon: pc[3] }, 25);
  }
  if (!pick && state) {
    const [s0, w0, n0, e0] = state.box, inside = cands.filter(c => c.lat >= s0 && c.lat <= n0 && c.lon >= w0 && c.lon <= e0);
    if (inside.length === 1 || (inside.length && cands.length > 1)) pick = inside[0];
  }
  if (!pick && near) {
    // Landkreis oder Nachbarort („Cham“), auch eine Urlaubsregion („Odenwald“)
    const a = AREAS.find(x => x.cc === k && (x.n.some(n => norm(n) === norm(near)) || norm(x.en) === norm(near)));
    const ref = a ? null : sameName(g, norm(near), k, postal)[0];
    if (a) pick = at(a, a.km);
    else if (ref) pick = at(ref, 60);
  }
  const chosen = pick || cands[0];
  // um den Ort suchen, wenn die Suche über den Namen woanders landen könnte (gewählt nicht der erste oder kein bekannter Ort)
  const out = { ...base(chosen, k), ...(cands.length > 1 && (chosen !== cands[0] || !chosen.top) ? { pinned: true } : {}) };
  // ohne passenden Zusatz unter mehreren gewählt: die anderen nennen
  if (!pick && cands.length > 1) {
    const label = (c: (typeof cands)[number]) => `${c.name}${c.plz ? ` ${c.plz}` : ""} (${c.lat.toFixed(2)}, ${c.lon.toFixed(2)})`;
    out.others = cands.slice(1, 6).map(label);
  }
  return out;
}

/** Fahrzeit grob wie im Artefakt: bis 100 km ca. 0,4 h + km/70, sonst Bahn/Auto ca. 0,6 h + km/110 */
export const travelHours = (km: number) => (km <= 100 ? 0.4 + km / 70 : 0.6 + km / 110);

/* ---------- Laden (einmal pro Sitzung, Orte nur für das gebrauchte Land) ---------- */

/** Daten liegen neben der App (world.json, packs.json, places/) */
const base = () => ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || "/";
export const bucket = (cc: string) => ((cc.charCodeAt(0) * 31 + cc.charCodeAt(1)) % 16).toString(16);
const cache: { core?: Promise<void>; buckets: Record<string, Promise<void>> } = { buckets: {} };

export async function loadGeo(g: GeoData, ccs: string[], fetchFn: typeof fetch = fetch): Promise<void> {
  const json = (u: string): Promise<any> => fetchFn(base() + u).then(r => (r.ok ? r.json() : null)).catch(() => null);
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
