/*
 * Orte der Reise für Karte und Entfernungen: gewählte Unterkünfte, Events (Anlass der Reise und Erlebnisse
 * mit Ort) und die Flughäfen der Ankunft und Abreise.
 */
import type { Trip } from "../model";
import { activeOption } from "../calc";
import { arrivals } from "../stays/presence";
import { hasCoords } from "./maps";
import { airportOf, kmBetween, type GeoData } from "./places";

export interface Spot { id: string; kind: "stay" | "event" | "airport"; name: string; lat: number; lon: number; itemId?: string }

export function tripSpots(trip: Trip, geo: GeoData): Spot[] {
  const out: Spot[] = [];
  const ev = trip.event;
  if (ev && hasCoords(ev)) out.push({ id: "event", kind: "event", name: ev.name, lat: ev.lat!, lon: ev.lon! });
  for (const i of trip.items) {
    if (i.status === "dropped" || (i.cat !== "stay" && i.cat !== "attractions")) continue;
    const l = (activeOption(i, trip) || i.options[0])?.loc;
    if (hasCoords(l)) out.push({ id: "item:" + i.id, kind: i.cat === "stay" ? "stay" : "event", name: i.name || i.options[0]?.label || "", lat: l.lat, lon: l.lon, itemId: i.id });
  }
  const aps = new Set(arrivals(trip).flatMap(a => [a.arrAp, a.depAp]).filter((c): c is string => !!c));
  for (const c of aps) {
    const ap = airportOf(geo, c);
    if (ap) out.push({ id: "ap:" + c, kind: "airport", name: `${ap.code} · ${ap.name}`, lat: ap.lat, lon: ap.lon });
  }
  return out;
}

/** nächster Ort einer Art mit Entfernung in km */
export function nearest(p: { lat: number; lon: number }, spots: Spot[], kind: Spot["kind"]): { spot: Spot; km: number } | null {
  let best: { spot: Spot; km: number } | null = null;
  for (const s of spots) {
    if (s.kind !== kind) continue;
    const km = kmBetween(p, s);
    if (!best || km < best.km) best = { spot: s, km };
  }
  return best;
}

/** „800 m“, „2,3 km“, „14 km“ */
export function kmText(km: number, lang = "de"): string {
  if (km < 1) return `${Math.max(50, Math.round(km * 20) * 50)} m`;
  const v = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${v.toLocaleString(lang, { maximumFractionDigits: 1 })} km`;
}
