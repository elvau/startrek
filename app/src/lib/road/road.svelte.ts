/*
 * Roadtrip in der App (#201): Etappen der Reise aus Route, Routen-Dienst (einmal je Strecke, im Speicher) und Länderdaten.
 * Ohne Routen-Dienst bzw. bis die Antwort da ist: Schätzung.
 */
import type { Trip } from "../model";
import { geo } from "../geo/geo.svelte";
import { tripRoute } from "../routeApp";
import { stations, itinerary } from "../itinerary";
import { etappen, isRoadTrip, nearestCountry, roadStops, withFerries, type Etappe, type Stop } from "./trip";
import type { LL, RoadLeg, RoadResult } from "./ors";

const URL_ = (import.meta.env.VITE_FLIGHTS_URL as string | undefined)?.replace(/\/$/, "") || "";

/** Antworten des Routen-Dienstes je Halte-Liste; null: keine (Schätzung) */
export const roads = $state<{ legs: Record<string, RoadLeg[] | null>; configured: boolean | null }>({ legs: {}, configured: null });
const asked = new Set<string>();

const keyOf = (stops: Stop[]) => stops.map(s => `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`).join(";");

function ask(stops: Stop[], key: string) {
  if (asked.has(key) || !URL_ || stops.length < 2) return;
  asked.add(key);
  void fetch(`${URL_}/road/route`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ points: stops.map(s => [s.lat, s.lon]) }) })
    .then(r => (r.ok ? r.json() : null))
    .then((r: RoadResult | null) => {
      if (r) roads.configured = r.configured;
      roads.legs[key] = r && r.legs.length === stops.length - 1 ? r.legs : null;
      // Grenze pro Minute im Such-Dienst: solange schätzen, danach noch einmal fragen
      if (r?.retryAfter) setTimeout(() => { asked.delete(key); delete roads.legs[key]; }, Math.min(120, r.retryAfter + 1) * 1000);
    })
    .catch(() => { roads.legs[key] = null; });
}

let cities: [string, number, number][] | null = null;
let countryOf: ((p: LL) => string | undefined) | null = null;
function countries() {
  if (!countryOf || !cities?.length) {
    cities = geo.world.flatMap(w => w.cities.map(c => [w.k, c[1], c[2]] as [string, number, number]));
    countryOf = nearestCountry(cities);
  }
  return countryOf;
}

/** Stadt nahe einem Punkt (für Zwischenstopps): größere Orte aus den Länderdaten */
export function cityNear(p: LL): { name: string; cc: string; lat: number; lon: number } | null {
  let best: { name: string; cc: string; lat: number; lon: number } | null = null, bd = Infinity;
  const cos = Math.cos((p[0] * Math.PI) / 180);
  for (const w of geo.world) for (const c of w.cities) {
    const dy = c[1] - p[0], dx = (c[2] - p[1]) * cos, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = { name: c[0], cc: w.k, lat: c[1], lon: c[2] }; }
  }
  return best;
}

export interface RoadPlan { stops: Stop[]; etappen: Etappe[]; est: boolean }

/** Roadtrip der Reise: Halte und Etappen; leer, wenn keine Auto-Reise (Flug) bzw. ohne Wohnort und Stationen */
export function roadPlan(trip: Trip): RoadPlan | null {
  if (!geo.world.length) return null;
  const days = itinerary(trip);
  if (!isRoadTrip(trip, stations(days).length)) return null;
  const base = roadStops(tripRoute(trip));
  if (base.length < 3 || base[0].kind !== "home") return null;
  // Fähren dazwischen (Inseln, GB, IE); Abschnitte auf dem Wasser kommen nicht vom Routen-Dienst
  const { stops, ferries } = withFerries(base, countries(), trip.ferry, trip.to);
  const key = keyOf(stops);
  ask(stops, key);
  const legs = roads.legs[key];
  const et = etappen(stops, stops.slice(1).map((_, i) => (ferries.has(i) ? null : legs?.[i] ?? null)), countries(), trip.to, ferries);
  return { stops, etappen: et, est: et.some(e => e.est && !e.ferry) };
}
