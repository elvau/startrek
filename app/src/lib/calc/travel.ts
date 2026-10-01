/*
 * Anwesenheit und Anreise, wie in der bisherigen App (presenceOf, stayCalc, accessFor).
 */
import { t, tn } from "../i18n/index.svelte";
import { hhKey, type Airport, type FlightLeg, type Household, type Item, type Option, type Traveler, type Trip } from "../model";
import { DEFAULT_AIRPORTS } from "../airports";

const DAY = 86400000;
const toD = (s: string) => new Date(s.slice(0, 10) + "T12:00:00Z");
export const okDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(toD(s).getTime());
export const addDays = (s: string, n: number) => new Date(toD(s).getTime() + n * DAY).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / DAY);

/** Nächte von a bis vor b, als Datum der jeweiligen Nacht */
export function nightsList(a?: string, b?: string): string[] {
  const out: string[] = [];
  if (!okDate(a) || !okDate(b)) return out;
  for (let d = a.slice(0, 10); d < b.slice(0, 10) && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Anwesenheit: erste Nacht a, Abreisetag d (nicht mehr übernachtet) */
export interface Presence { a: string; d: string; src: "manual" | "flight" }

export const needs = (p: Presence | null, night: string) => !p || (p.a <= night && night < p.d);

/** Flug einer Person: einer, in dem sie ausdrücklich steht, sonst einer für alle */
/**
 * Hin- und Rückflug einer Person, auch aus getrennten Posten (erst nur bis Rio, später der Rückflug):
 * Posten, in denen sie ausdrücklich steht, sonst die für alle; erster Hinflug, letzter Rückflug.
 */
export function flightLegs(t: Traveler, trip: Trip, pick: (it: Item) => Option | null): { out?: FlightLeg; back?: FlightLeg } {
  const fl = trip.items.filter(it => it.cat === "flights" && it.status !== "dropped" && (it.follow || it.options.some(o => o.legs?.length)));
  const mine = fl.filter(it => it.participants?.includes(t.id));
  const legs = (mine.length ? mine : fl.filter(it => !it.participants)).flatMap(it => pick(it)?.legs || []);
  const by = (dir: FlightLeg["dir"]) => legs.filter(l => l.dir === dir && okDate(l.dep)).sort((a, b) => a.dep.localeCompare(b.dep));
  return { out: by("out")[0], back: by("back").at(-1) };
}

/** alle Flüge einer Person in zeitlicher Reihenfolge (wie flightLegs: eigene Posten, sonst die für alle) */
function allLegs(t: Traveler, trip: Trip, pick: (it: Item) => Option | null): FlightLeg[] {
  const fl = trip.items.filter(it => it.cat === "flights" && it.status !== "dropped" && (it.follow || it.options.some(o => o.legs?.length)));
  const mine = fl.filter(it => it.participants?.includes(t.id));
  return (mine.length ? mine : fl.filter(it => !it.participants)).flatMap(it => pick(it)?.legs || [])
    .filter(l => okDate(l.dep) && okDate(l.arr)).sort((a, b) => a.dep.localeCompare(b.dep));
}

/** Station zwischen zwei Flügen: gelandet in ap, übernachtet von from bis to (Abreisetag) */
export interface Stop { ap: string; city?: string; from: string; to: string }

/** Stationen einer Person aus ihren Flügen (Rundreise: jede Stadt; normale Reise: das Ziel); ohne Übernachtung keine Station */
export function stopsOf(t: Traveler, trip: Trip, pick: (it: Item) => Option | null): Stop[] {
  const legs = allLegs(t, trip, pick);
  const out: Stop[] = [];
  for (let i = 0; i + 1 < legs.length; i++) {
    const a = legs[i], b = legs[i + 1], from = a.arr.slice(0, 10), to = b.dep.slice(0, 10);
    if (to > from) out.push({ ap: a.to, ...(a.toCity ? { city: a.toCity } : {}), from, to });
  }
  return out;
}

/** Nächte im Flugzeug: Abflug an einem Tag, Landung an einem späteren (z. B. 23:25 → 07:00) */
export function airNights(t: Traveler, trip: Trip, pick: (it: Item) => Option | null): Set<string> {
  return new Set(allLegs(t, trip, pick).flatMap(l => nightsList(l.dep.slice(0, 10), l.arr.slice(0, 10))));
}

export function presenceOf(t: Traveler, trip: Trip, pick: (it: Item) => Option | null): Presence | null {
  const h = trip.households?.[hhKey(t)];
  if (okDate(h?.arrive) && okDate(h?.depart) && h!.depart! > h!.arrive!) return { a: h!.arrive!, d: h!.depart!, src: "manual" };
  const { out, back } = flightLegs(t, trip, pick);
  if (!out || !back || !okDate(out.arr) || !okDate(back.dep)) return null;
  return { a: out.arr.slice(0, 10), d: back.dep.slice(0, 10), src: "flight" };
}

/* ---------- Anreise zum Flughafen ---------- */

export const airportsOf = (trip: Trip): Airport[] => trip.settings.airports?.length ? trip.settings.airports : DEFAULT_AIRPORTS;

/** Straßenkilometer grob aus der Luftlinie (Faktor 1,3) */
export function roadKm(g: { lat: number; lon: number } | undefined, ap: Airport): number | null {
  if (!g) return null;
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(ap.lat - g.lat), dLon = r(ap.lon - g.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(g.lat)) * Math.cos(r(ap.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a)) * 1.3;
}

export interface Access { cost: number; hours: number; km: number | null; info: string }

/** Anreise eines Haushalts zum Flughafen, hin und zurück, mit Parken */
export function accessFor(name: string, ap: Airport, persons: number, days: number, trip: Trip, depth = 0): Access {
  const h: Household = trip.households?.[name] || {};
  if (h.mode === "with" && h.link && h.link !== name && depth < 3) {
    const main = accessFor(h.link, ap, 1, days, trip, depth + 1);
    return { cost: 0, hours: main.hours, km: main.km, info: t("hh.ridesWith", { name: h.link }) };
  }
  const km = roadKm(h.geo, ap);
  const driveH = km != null ? km / 85 + 0.25 : ap.h;
  if (h.mode === "train" || km == null) {
    return { cost: ap.pp * persons, hours: km != null ? driveH * 1.4 : ap.h, km, info: `${t("hh.train")} ${ap.pp} € × ${persons}${km == null && h.mode !== "train" ? ` (${t("acc.noPlz")})` : ""}` };
  }
  const cars = Math.max(1, h.cars || 1);
  const drive = 2 * km * (trip.settings.kmCost ?? 0.3) * cars, park = ap.park * days * cars;
  return { cost: drive + park, hours: driveH, km, info: t("acc.car", { km: Math.round(km), cars: cars > 1 ? ` ${t("acc.withCars", { n: cars })}` : "", days: tn("n.days", days) }) };
}

export interface AccessCalc { cost: number; per: Record<string, number>; lines: { hh: string; ap: string; a: Access }[]; missing?: string }

/** Anreise für einen Flug: je Haushalt der Mitfliegenden, verteilt auf dessen Mitfliegende */
export function flightAccess(opt: Option, people: Traveler[], trip: Trip): AccessCalc | null {
  const out = opt.legs?.find(l => l.dir === "out"), back = opt.legs?.find(l => l.dir === "back");
  if (!out) return null;
  const ap = airportsOf(trip).find(a => a.code === out.from.toUpperCase());
  if (!ap) return { cost: 0, per: {}, lines: [], missing: out.from };
  const days = back && okDate(back.dep) && okDate(out.dep) ? dayDiff(out.dep, back.dep) + 1 : 1;
  const groups: Record<string, Traveler[]> = {};
  people.forEach(t => (groups[hhKey(t)] ||= []).push(t));
  const res: AccessCalc = { cost: 0, per: {}, lines: [] };
  for (const [hh, ts] of Object.entries(groups)) {
    const a = accessFor(hh, ap, ts.length, days, trip);
    res.cost += a.cost;
    ts.forEach(t => (res.per[t.id] = a.cost / ts.length));
    res.lines.push({ hh, ap: ap.code, a });
  }
  return res;
}
