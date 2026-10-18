/*
 * Angebote einer Unterkunft vergleichen (#438): Entfernungen zu Bezugspunkten der Reise (Zentrum des Orts,
 * Events und Erlebnisse mit Ort, Flughafen) und was die ganze Reise mit dem Angebot kostet (inkl. Verpflegung,
 * die von der Verpflegung der Unterkunft abhängt).
 */
import type { FlightLeg, Item, Option, Trip } from "../model";
import { activeOption, totals } from "../calc";
import { syncFood } from "../food";
import { hasCoords } from "../geo/maps";
import { ccOf, findCity, kmBetween, townNear, type GeoData, type Place } from "../geo/places";
import { tripSpots } from "../geo/spots";

/** Angebote liegen höchstens so weit auseinander: eine gemeinsame Karte, sonst je Angebot ein Kartenbild */
export const NEAR_KM = 15;

export interface RefPoint { id: string; kind: "center" | "event" | "airport" | "custom" | "stay"; name: string; lat: number; lon: number }

/** Bezugspunkte: Zentrum des Orts der Reise (sonst des Orts der Suche), Events und Erlebnisse mit Ort, Flughäfen der Ankunft */
export function refPoints(trip: Trip, g: GeoData, item?: Item, withStays = false): RefPoint[] {
  const out: RefPoint[] = [];
  // Ort der Reise; fehlt er (Unterkunft direkt gesucht), der Ort, für den die Angebote gesucht wurden
  const q = item?.options.find(o => o.query?.place)?.query;
  const place = trip.place || q?.place, country = trip.place ? trip.country : q?.country;
  const city = place ? findCity(g, place, ccOf(g, country)) : null;
  if (city) out.push({ id: "center", kind: "center", name: city.name, lat: city.lat, lon: city.lon });
  for (const r of trip.refs || []) out.push({ ...r, id: "own:" + r.id, kind: "custom" });
  for (const s of tripSpots(trip, g)) {
    // Unterkünfte nur als Bezug für Erlebnisse (wie weit vom Hotel), nie für Unterkünfte selbst
    if ((s.kind === "stay" && !withStays) || (item && s.itemId === item.id)) continue;
    // Unterkunft unter dem Namen des gewählten Angebots („Hotel Mar“ statt „Unterkunft in Split“)
    const it = s.kind === "stay" ? trip.items.find(i => i.id === s.itemId) : undefined;
    const name = (it && activeOption(it, trip)?.label) || s.name;
    out.push({ id: s.id, kind: s.kind, name, lat: s.lat, lon: s.lon });
  }
  return out;
}

/**
 * Lage aus einer Eingabe für einen eigenen Bezugspunkt: Koordinaten („39.51, 2.74“) oder ein Google-Maps-Link
 * (…/@39.51,2.74,15z oder …!3d39.51!4d2.74); sonst ein Ort aus den Ortsdaten
 */
export function parseSpot(text: string, g: GeoData, cc?: string | null): { lat: number; lon: number; name?: string } | null {
  const s = text.trim();
  if (!s) return null;
  const ok = (lat: number, lon: number) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s);
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(s);
  const q = /[?&](?:q|query|ll)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(s);
  const plain = /^(-?\d{1,2}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)$/.exec(s);
  for (const m of [pin, at, q, plain]) if (m && ok(+m[1], +m[2])) return { lat: +m[1], lon: +m[2] };
  const c = findCity(g, s, cc);
  return c ? { lat: c.lat, lon: c.lon, name: c.name } : null;
}

/** Buchstabe je Angebot (A, B, C …), wie auf der Karte */
export const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Entfernungen je Angebot (Kennung) zu jedem Bezugspunkt in km; null ohne Koordinaten */
export function distances(options: Option[], refs: RefPoint[]): Record<string, Record<string, number> | null> {
  const out: Record<string, Record<string, number> | null> = {};
  for (const o of options) {
    if (!hasCoords(o.loc)) { out[o.id] = null; continue; }
    const m: Record<string, number> = {};
    for (const r of refs) m[r.id] = kmBetween(o.loc, r);
    out[o.id] = m;
  }
  return out;
}

/** je Bezugspunkt das nächste Angebot (nur wenn mindestens zwei Angebote Koordinaten haben) */
export function nearestTo(d: Record<string, Record<string, number> | null>, refs: RefPoint[]): Record<string, string> {
  const out: Record<string, string> = {};
  const withLoc = Object.entries(d).filter((e): e is [string, Record<string, number>] => !!e[1]);
  if (withLoc.length < 2) return out;
  for (const r of refs) {
    let best: [string, number] | null = null;
    for (const [id, m] of withLoc) if (!best || m[r.id] < best[1]) best = [id, m[r.id]];
    if (best) out[r.id] = best[0];
  }
  return out;
}

/** größter Abstand zwischen zwei Angeboten mit Koordinaten (km); 0 bei weniger als zwei */
export function spreadKm(options: Option[]): number {
  const ps = options.map(o => o.loc).filter(hasCoords);
  let max = 0;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) max = Math.max(max, kmBetween(ps[i], ps[j]));
  return max;
}

/**
 * Weit auseinander (z. B. Palma, Cala Ratjada, Sóller): je Angebot der nächste Ort mit Entfernung zu dessen Kern
 * statt der Entfernung zum Zentrum des Reiseorts
 */
export function townsOf(options: Option[], trip: Trip, g: GeoData): Record<string, Place | null> {
  const q = options.find(o => o.query?.country)?.query;
  const cc = ccOf(g, trip.country || q?.country);
  return Object.fromEntries(options.map(o => [o.id, cc && hasCoords(o.loc) ? townNear(g, o.loc, cc) : null]));
}

export interface Effect { total: number; perPerson: number; people: number; food: number }

/**
 * Was die ganze Reise kostet, wenn dieses Angebot gewählt ist: Reise kopieren, Angebot wählen, Verpflegung nachführen
 * (hängt von der Verpflegung der Unterkunft ab), rechnen. Die Reise selbst bleibt unverändert.
 */
export function effectOf(trip: Trip, itemId: string, optionId: string, g: GeoData): Effect {
  const tr: Trip = JSON.parse(JSON.stringify(trip));
  const it = tr.items.find(i => i.id === itemId);
  if (it) it.chosen = optionId;
  if (g.world.length) syncFood(tr, g);
  const T = totals(tr);
  const food = tr.items.filter(i => i.auto === "food").reduce((s, i) => s + (T.items[i.id]?.net || 0), 0);
  const people = Math.max(1, T.active);
  return { total: T.total, perPerson: T.total / people, people, food };
}

/* ---------- Flüge (#441) ---------- */

export interface FlightFacts { out?: FlightLeg; back?: FlightLeg; stops: number; minutes: number; bag?: "checked" | "cabin" | "personal" }

/** Hin- und Rückflug, meiste Umstiege, Flugzeit gesamt, Gepäck (größtes, das für alle dabei ist) */
export function flightFacts(o: Option): FlightFacts {
  const legs = o.legs || [];
  const out = legs.find(l => l.dir === "out"), back = legs.find(l => l.dir === "back");
  const b = o.baggage ?? legs.find(l => l.baggage)?.baggage;
  const bag = b ? (b.checked > 0 ? "checked" : b.cabin > 0 ? "cabin" : b.personal > 0 ? "personal" : undefined) : undefined;
  return { out, back, stops: Math.max(0, ...legs.map(l => l.stops || 0)), minutes: legs.reduce((s, l) => s + (l.minutes || 0), 0), ...(bag ? { bag } : {}) };
}
