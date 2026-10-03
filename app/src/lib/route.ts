/*
 * Reiseroute für Karte, Bild und Animation: vom Wohnort zum Abflughafen, Flug, die Orte der Nächte in Reihenfolge
 * (aus dem Tagesplan), Flüge zwischen Stationen, Rückflug und zurück nach Hause. Ohne Flug: Wohnort → Stationen → Wohnort.
 */
import { activeOption } from "./calc";
import type { FlightLeg, Trip } from "./model";
import { stations, type Day } from "./itinerary";
import { kmBetween } from "./geo/places";

export interface LatLon { lat: number; lon: number }
export interface RPoint extends LatLon {
  name: string;
  kind: "home" | "airport" | "station";
  /** Station: Nächte und erster Tag (Tag n des Tagesplans) */
  nights?: number;
  day?: number;
  date?: string;
}
export interface RSeg { a: number; b: number; mode: "flight" | "ground"; date?: string }
export interface Route { points: RPoint[]; segs: RSeg[] }

export interface Resolvers {
  /** Flughafen (IATA) → Lage */
  airport: (code: string) => (LatLon & { name?: string }) | null;
  /** Ortsname → Lage */
  place: (name: string) => LatLon | null;
}

/** Lage einer Station: die Unterkunft dort (aus der Suche), sonst der Ort */
function stationLoc(trip: Trip, place: string, from: string, r: Resolvers): LatLon | null {
  const st = trip.items.find(i => i.cat === "stay" && i.status !== "dropped" && i.from && i.to && i.from <= from && from < i.to);
  const loc = st ? activeOption(st, trip)?.loc : undefined;
  if (loc?.lat != null && loc?.lon != null) return { lat: loc.lat, lon: loc.lon };
  return r.place(place);
}

export function buildRoute(trip: Trip, days: Day[], r: Resolvers, home?: { name: string; lat: number; lon: number } | null): Route {
  const legs: FlightLeg[] = trip.items.filter(i => i.cat === "flights" && i.status !== "dropped" && !i.follow)
    .flatMap(i => activeOption(i, trip)?.legs || []).filter(l => l.dep).sort((a, b) => a.dep.localeCompare(b.dep));
  // Flüge, die mehrere Familien getrennt buchen, sind oft gleich: je Strecke und Tag nur einmal
  const seen = new Set<string>();
  const uniq = legs.filter(l => { const k = `${l.from}|${l.to}|${l.dep.slice(0, 10)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const out = uniq.find(l => l.dir === "out"), back = [...uniq].reverse().find(l => l.dir === "back"), via = uniq.filter(l => l.dir === "via");
  const sts = stations(days).map(s => ({ ...s, loc: stationLoc(trip, s.place, s.from, r) })).filter(s => s.loc);
  const dayOf = (d: string) => days.find(x => x.date === d)?.n;

  const points: RPoint[] = [], segs: RSeg[] = [];
  const push = (p: RPoint, mode: RSeg["mode"], date?: string) => {
    const prev = points.at(-1);
    // fast derselbe Ort (Flughafen in der Stadt, zweimal dieselbe Station): nicht doppelt
    if (prev && kmBetween(prev, p) < 2) { if (p.kind === "station" && prev.kind !== "station") points[points.length - 1] = { ...p }; return; }
    if (prev) segs.push({ a: points.length - 1, b: points.length, mode, ...(date ? { date } : {}) });
    points.push(p);
  };
  const ap = (code: string): RPoint | null => { const a = r.airport(code); return a ? { name: code, lat: a.lat, lon: a.lon, kind: "airport" } : null; };
  const flight = (l: FlightLeg) => {
    const a = ap(l.from), b = ap(l.to);
    if (a) push(a, "ground", l.dep.slice(0, 10));
    if (b) push(b, "flight", l.dep.slice(0, 10));
  };

  if (home) push({ ...home, kind: "home" }, "ground");
  if (out) flight(out);
  sts.forEach((s, i) => {
    // Flug zwischen zwei Stationen (Rundreise)
    if (i > 0) for (const v of via) { const d = v.dep.slice(0, 10); if (d >= sts[i - 1].from && d <= s.from) flight(v); }
    push({ name: s.place, lat: s.loc!.lat, lon: s.loc!.lon, kind: "station", nights: s.nights, day: dayOf(s.from), date: s.from }, "ground", s.from);
  });
  if (back) flight(back);
  if (home && points.length > 1) push({ ...home, kind: "home" }, "ground", days.at(-1)?.date);
  return { points, segs };
}

/** worauf Bild und Karte scharfstellen: bei mehreren Stationen die Stationen (Flüge kommen vom Rand), sonst alles */
export function focus(r: Route): RPoint[] {
  const st = r.points.filter(p => p.kind === "station");
  return st.length > 1 ? st : r.points;
}

/** Bogen für Flüge (für Karte und Animation): Punkte auf einem flachen Bogen zwischen a und b */
export function arc(a: LatLon, b: LatLon, n = 32): [number, number][] {
  const dx = b.lon - a.lon, dy = b.lat - a.lat, len = Math.hypot(dx, dy);
  const nx = -dy / (len || 1), ny = dx / (len || 1), h = len * 0.18;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, bump = 4 * t * (1 - t) * h;
    return [a.lon + dx * t + nx * bump, a.lat + dy * t + ny * bump] as [number, number];
  });
}

/** einfache Projektion in ein Rechteck (für das Mini-Bild ohne Karte) */
export function project(points: LatLon[], w: number, h: number, pad = 8): (p: LatLon) => [number, number] {
  if (!points.length) return () => [w / 2, h / 2];
  const k = Math.cos(((points.reduce((a, p) => a + p.lat, 0) / points.length) * Math.PI) / 180);
  const xs = points.map(p => p.lon * k), ys = points.map(p => -p.lat);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1));
  const ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  return p => [ox + (p.lon * k - x0) * s, oy + (-p.lat - y0) * s];
}
