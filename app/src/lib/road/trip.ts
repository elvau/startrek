/*
 * Roadtrip (#201): Etappen Wohnort → Stationen → Wohnort, Länder auf der Strecke und Kosten je Auto. Strecken kommen vom
 * Routen-Dienst (road/ors.ts) oder als Schätzung (Luftlinie × 1,3 bei 85 km/h). Länder: Stichproben entlang des Verlaufs,
 * jede zählt zum Land der nächstgelegenen Stadt (Ländergrenzen haben wir nicht, in Europa genau genug für Vignette und Maut).
 */
import type { Extra, Trip } from "../model";
import { FEES_AS_OF, TOLLS, VIGNETTES } from "../fees";
import type { Route } from "../route";
import { km, thin, type LL, type RoadLeg } from "./ors";

export interface Stop { name: string; lat: number; lon: number; kind: "home" | "station"; date?: string }
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
export function etappen(stops: Stop[], legs: (RoadLeg | null)[], countryOf: (p: LL) => string | undefined, lastDate?: string): Etappe[] {
  return stops.slice(1).map((to, i) => {
    const from = stops[i];
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
export function roadTripCost(et: Etappe[], kmCost: number, rate: (cur: string) => number, fallbackDate = ""): RoadCost {
  const total = et.reduce((s, e) => s + e.km, 0);
  const byCc: Record<string, { km: number; dates: string[] }> = {};
  for (const e of et) for (const cc in e.cc) {
    if (!e.cc[cc]) continue;
    (byCc[cc] ||= { km: 0, dates: [] }).km += e.cc[cc];
    byCc[cc].dates.push(e.date || fallbackDate);
  }
  const extras: Extra[] = [];
  const src = (s: string) => `${s}, ${FEES_AS_OF}`;
  for (const v of VIGNETTES) {
    const c = byCc[v.cc];
    if (!c) continue;
    const n = Math.max(1, vignetteCount(c.dates.filter(Boolean), v.days));
    extras.push({ id: `road:vignette:${v.cc}`, kind: "vignette", cc: v.cc, amount: Math.round((n * v.amount / rate(v.currency)) * 100) / 100,
      basis: "booking", pay: "onsite", est: true, source: n > 1 ? `${n} × · ${src(v.source)}` : src(v.source) });
  }
  for (const cc in byCc) {
    const tl = TOLLS[cc];
    if (!tl) continue;
    extras.push({ id: `road:toll:${cc}`, kind: "toll", cc, amount: Math.round(((byCc[cc].km * tl.per100) / 100 / rate(tl.currency)) * 100) / 100,
      basis: "booking", pay: "onsite", est: true, source: src(tl.source) });
  }
  return { fuel: Math.round(total * kmCost), km: total, extras, countries: Object.keys(byCc) };
}
