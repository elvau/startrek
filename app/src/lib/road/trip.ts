/*
 * Roadtrip (#201): Etappen Wohnort → Stationen → Wohnort, Länder auf der Strecke und Kosten je Auto. Strecken kommen vom
 * Routen-Dienst (road/ors.ts) oder als Schätzung (Luftlinie × 1,3 bei 85 km/h). Länder: Stichproben entlang des Verlaufs,
 * jede zählt zum Land der nächstgelegenen Stadt (Ländergrenzen haben wir nicht, in Europa genau genug für Vignette und Maut).
 */
import type { Extra, Trip } from "../model";
import { FEES_AS_OF, TOLLS, VIGNETTES, safeRate } from "../fees";
import type { Route } from "../route";
import { km, thin, type LL, type RoadLeg } from "./ors";
import { ferriesBetween, type FerryPick } from "./ferries";
import { CAMPER_FERRY, HEAVY, HEIGHT_FACTOR, type Vehicle } from "./camper";

export interface Stop { name: string; lat: number; lon: number; kind: "home" | "station" | "port"; date?: string }
export interface Etappe {
  from: Stop;
  to: Stop;
  /** Fahrtag (JJJJ-MM-TT) */
  date?: string;
  km: number;
  /** reine Fahrzeit in Minuten */
  min: number;
  path: LL[];
  /** Kilometer je Land */
  cc: Record<string, number>;
  /** geschätzt (kein Routen-Dienst) */
  est: boolean;
  /** Überfahrt mit der Fähre statt Fahrt (km 0, Dauer der Überfahrt); alts: andere Verbindungen, key: Wahl in trip.ferry */
  ferry?: FerryPick;
  alts?: FerryPick[];
  key?: string;
}

/** Schlüssel der Fährwahl je Überfahrt (von Halt zu Halt) */
export const ferryKey = (a: Stop, b: Stop) => `${a.name}>${b.name}`;

/**
 * Fähren zwischen die Halte setzen: liegen zwei Halte in verschiedenen Gebieten (Insel, GB, IE), kommen Abfahrts- und
 * Ankunftshafen dazwischen. choice: gewählte Verbindung je Überfahrt („none“: keine Fähre). Rückgabe: Halte mit Häfen und
 * die Fähre je Abschnitt (Index des Abschnitts, der am Abfahrtshafen beginnt).
 */
export function withFerries(stops: Stop[], ccOf: (p: LL) => string | undefined, choice: Record<string, string> = {}, lastDate?: string):
  { stops: Stop[]; ferries: Map<number, { pick: FerryPick; alts: FerryPick[]; key: string }> } {
  const out: Stop[] = [stops[0]], ferries = new Map<number, { pick: FerryPick; alts: FerryPick[]; key: string }>();
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i], key = ferryKey(a, b);
    const alts = choice[key] === "none" ? [] : ferriesBetween(a, b, ccOf);
    if (alts.length) {
      const pick = alts.find(p => p.ferry.id === choice[key]) || alts[0];
      const date = b.date || (b.kind === "home" ? lastDate : undefined);
      // Hafen nur als eigener Halt, wenn er nicht (fast) am Halt selbst liegt (Station Olbia = Hafen Olbia)
      const near = (s: Stop, p: { lat: number; lon: number }) => km([s.lat, s.lon], [p.lat, p.lon]) < 5;
      if (!near(a, pick.from)) out.push({ name: pick.from.name, lat: pick.from.lat, lon: pick.from.lon, kind: "port", ...(date ? { date } : {}) });
      ferries.set(out.length - 1, { pick, alts, key });
      if (!near(b, pick.to)) out.push({ name: pick.to.name, lat: pick.to.lat, lon: pick.to.lon, kind: "port", ...(date ? { date } : {}) });
    }
    out.push(b);
  }
  return { stops: out, ferries };
}

/** Faktor Luftlinie → Straße und Reisetempo für die Schätzung */
export const ROAD_FACTOR = 1.3;
export const ROAD_KMH = 85;
/** Pause: so viele Minuten je angefangene 2 Stunden Fahrt (die erste nicht) */
export const PAUSE_MIN = 15;
/** ab so vielen Stunden (mit Pausen) gilt eine Etappe als lang */
export const LONG_H = 8;

/** Auto-Reise: kein Flug, und ein Auto-Posten oder mehrere Stationen */
export function isRoadTrip(trip: Trip, stations: number): boolean {
  const live = trip.items.filter(i => i.status !== "dropped");
  if (live.some(i => i.cat === "flights")) return false;
  return live.some(i => i.hint === "road:car") || stations >= 2;
}

/** Halte aus der Reiseroute: Wohnort, Stationen, Wohnort (nur ohne Flug) */
export function roadStops(r: Route): Stop[] {
  if (r.segs.some(s => s.mode === "flight")) return [];
  return r.points.filter(p => p.kind === "home" || p.kind === "station")
    .map(p => ({ name: p.name, lat: p.lat, lon: p.lon, kind: p.kind as Stop["kind"], ...(p.date ? { date: p.date } : {}) }));
}

/** Schätzung ohne Routen-Dienst: gerader Verlauf, Straße = Luftlinie × 1,3 */
export function estimateLeg(a: LL, b: LL): RoadLeg {
  const d = km(a, b), n = Math.max(1, Math.ceil(d / 15));
  const path = Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as LL);
  const road = Math.round(d * ROAD_FACTOR);
  return { km: road, min: Math.round((road / ROAD_KMH) * 60), path };
}

/** Fahrzeit mit Pausen (15 Minuten je volle 2 Stunden) */
export const withPauses = (min: number) => min + PAUSE_MIN * Math.max(0, Math.ceil(min / 120) - 1);

/** Kilometer je Land entlang des Verlaufs, auf die Gesamtlänge hochgerechnet */
export function countryKm(path: LL[], total: number, countryOf: (p: LL) => string | undefined): Record<string, number> {
  const pts = thin(path, 10), raw: Record<string, number> = {};
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = km(pts[i - 1], pts[i]);
    const mid: LL = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
    const cc = countryOf(mid);
    if (cc) raw[cc] = (raw[cc] || 0) + d;
    sum += d;
  }
  const out: Record<string, number> = {};
  for (const cc in raw) out[cc] = Math.round((raw[cc] / (sum || 1)) * total);
  return out;
}

/** Land eines Punkts: Land der nächstgelegenen Stadt (Liste [cc, lat, lon]) */
export function nearestCountry(cities: [string, number, number][]): (p: LL) => string | undefined {
  return p => {
    let best: string | undefined, bd = Infinity;
    const cos = Math.cos((p[0] * Math.PI) / 180);
    for (const [cc, lat, lon] of cities) {
      const dy = lat - p[0], dx = (lon - p[1]) * cos, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = cc; }
    }
    return best;
  };
}

/** Etappen aus Halten und Strecken (Routen-Dienst oder Schätzung je Etappe) */
export function etappen(stops: Stop[], legs: (RoadLeg | null)[], countryOf: (p: LL) => string | undefined, lastDate?: string,
  ferries?: Map<number, { pick: FerryPick; alts: FerryPick[]; key: string }>): Etappe[] {
  return stops.slice(1).map((to, i) => {
    const from = stops[i];
    const f = ferries?.get(i);
    if (f) return { from, to, ...(to.date ? { date: to.date } : {}), km: 0, min: Math.round(f.pick.ferry.hours * 60), path: [], cc: {}, est: false, ferry: f.pick, alts: f.alts, key: f.key };
    const real = legs[i];
    const l = real || estimateLeg([from.lat, from.lon], [to.lat, to.lon]);
    // Fahrtag: Ankunft an der Station; zurück nach Hause am letzten Tag
    const date = to.date || (to.kind === "home" ? stops.at(-1)?.date || lastDate : undefined);
    return { from, to, ...(date ? { date } : {}), km: l.km, min: l.min, path: l.path, cc: countryKm(l.path, l.km, countryOf), est: !real };
  });
}

/** Vignetten je Land: so viele, wie Zeitfenster nötig sind (Fahrtage im Land, je Vignette ihre Gültigkeit) */
export function vignetteCount(dates: string[], days: number): number {
  const ds = [...new Set(dates)].sort();
  let n = 0, until = "";
  for (const d of ds) {
    if (d <= until) continue;
    n++;
    until = new Date(Date.parse(d) + (days - 1) * 86400000).toISOString().slice(0, 10);
  }
  return n;
}

export interface RoadCost { fuel: number; km: number; extras: Extra[]; countries: string[] }

/**
 * Kosten der ganzen Runde je Auto: Sprit (km × Kosten je km), jede Vignette nur so oft wie nötig, Maut nach den Kilometern
 * im Land. rate: Einheiten der Währung je Euro.
 */
/** vehicle: Camper (Maut für Fahrzeuge über 2 m, Fähre mit Camper-Tarif), über 3,5 t (GO-Box statt Vignette AT, PSVA statt Vignette CH) */
export function roadTripCost(et: Etappe[], kmCost: number, rate0: (cur: string) => number, fallbackDate = "", vehicle: Vehicle = {}): RoadCost {
  const rate = safeRate(rate0);
  const total = et.reduce((s, e) => s + e.km, 0);
  const byCc: Record<string, { km: number; dates: string[] }> = {};
  for (const e of et) for (const cc in e.cc) {
    if (!e.cc[cc]) continue;
    (byCc[cc] ||= { km: 0, dates: [] }).km += e.cc[cc];
    byCc[cc].dates.push(e.date || fallbackDate);
  }
  const extras: Extra[] = [];
  const src = (s: string) => `${s}, ${FEES_AS_OF}`;
  // über 3,5 t: Österreich nach km (GO-Box), Schweiz je Tag (PSVA) statt Vignette
  const heavy = !!vehicle.camper && !!vehicle.heavy;
  if (heavy && byCc.AT) extras.push({ id: "road:gobox:AT", kind: "toll", cc: "AT", amount: Math.round(byCc.AT.km * HEAVY.AT.perKm * 100) / 100, basis: "booking", pay: "onsite", est: true, source: src(HEAVY.AT.source) });
  if (heavy && byCc.CH) {
    const days = new Set(byCc.CH.dates.filter(Boolean)).size || 1;
    extras.push({ id: "road:psva:CH", kind: "toll", cc: "CH", amount: Math.round((Math.max(HEAVY.CH.min, days * HEAVY.CH.perDay) / rate(HEAVY.CH.currency)) * 100) / 100, basis: "booking", pay: "onsite", est: true, source: src(HEAVY.CH.source) });
  }
  for (const v of VIGNETTES) {
    const c = byCc[v.cc];
    if (!c || (heavy && (v.cc === "AT" || v.cc === "CH"))) continue;
    const n = Math.max(1, vignetteCount(c.dates.filter(Boolean), v.days));
    extras.push({ id: `road:vignette:${v.cc}`, kind: "vignette", cc: v.cc, amount: Math.round((n * v.amount / rate(v.currency)) * 100) / 100,
      basis: "booking", pay: "onsite", est: true, source: n > 1 ? `${n} × · ${src(v.source)}` : src(v.source) });
  }
  for (const cc in byCc) {
    const tl = TOLLS[cc];
    if (!tl) continue;
    const f = vehicle.camper ? HEIGHT_FACTOR[cc] ?? 1 : 1;
    extras.push({ id: `road:toll:${cc}`, kind: "toll", cc, amount: Math.round(((byCc[cc].km * tl.per100 * f) / 100 / rate(tl.currency)) * 100) / 100,
      basis: "booking", pay: "onsite", est: true, source: src(tl.source) });
  }
  // Fähren: Fahrzeug (bzw. Paket mit Pflichtkabine), Personen, Kabine nur auf Wunsch (ausgeschaltet)
  et.forEach((e, i) => {
    const f = e.ferry?.ferry;
    if (!f) return;
    const src = `${e.ferry!.from.name} → ${e.ferry!.to.name} · ${f.ops.join(", ")} · ${f.source}, ${FEES_AS_OF}`;
    const eur = (v: number) => Math.round((v / rate(f.currency)) * 100) / 100;
    const base = { basis: "booking" as const, pay: "extra" as const, est: true, source: src };
    const veh = vehicle.camper ? f.camper ?? (f.car != null ? f.car * CAMPER_FERRY : undefined) : f.car;
    if (veh != null) extras.push({ id: `road:ferry:${f.id}:${i}`, kind: "ferry", amount: eur(veh), ...base });
    if (f.person != null && !f.pkg) extras.push({ id: `road:ferryp:${f.id}:${i}`, kind: "ferryPerson", amount: eur(f.person), ...base, basis: "person", freeUpTo: 3 });
    if (f.cabin != null && f.night && !f.pkg) extras.push({ id: `road:cabin:${f.id}:${i}`, kind: "cabin", amount: eur(f.cabin), ...base, off: true });
  });
  return { fuel: Math.round(total * kmCost), km: total, extras, countries: Object.keys(byCc) };
}
