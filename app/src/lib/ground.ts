/*
 * Bahn, Fernbus, Auto und Reisebus statt Flug: bei Zielen bis etwa 700 km Luftlinie vom Wohnort der Gruppe.
 * Richtwerte pro Person für Hin- und Rückfahrt (grob, keine Fahrplanauskunft), dazu Links zur Suche.
 * Reisebus ab 8 Personen: Tagessatz plus Kilometer, geteilt durch die Gruppe.
 * Zum Vergleich die Zeit von Tür zu Tür, beim Flug mit Anfahrt, 2 Stunden vorher am Flughafen, Gepäck und Weg in die Stadt.
 */
import { t } from "./i18n/index.svelte";
import { hhKey, isActive, uid, type Item, type Trip } from "./model";
import { kmBetween } from "./geo/places";
import type { AirportData } from "./geo/locations";
import { airportsOf, dayDiff, okDate } from "./calc/travel";
import { calcItem } from "./calc";

export interface Spot { name: string; lat: number; lon: number }

export type GroundKind = "flight" | "train" | "bus" | "car" | "coach";
/** Abschnitte der Reisezeit: zum Flughafen, vorher da, Flug, Gepäck, in die Stadt, zum und vom Bahnhof bzw. Halt, Fahrt, Pausen */
export type PartKind = "access" | "early" | "air" | "land" | "transfer" | "station" | "stop" | "ride" | "breaks";
export interface TimePart { k: PartKind; h: number }
export interface GroundMode {
  k: GroundKind;
  /** Euro pro Person, hin und zurück (beim Flug nur, wenn ein Flug-Posten da ist) */
  lo?: number;
  hi?: number;
  /** Tür zu Tür, eine Richtung, in Stunden */
  hours: number;
  parts: TimePart[];
  /** Flug: aus dem Flug-Posten statt geschätzt */
  real?: boolean;
  /** Flug: „CGN → BER“ */
  route?: string;
}
export interface GroundPlan { from: Spot; to: Spot; km: number; road: number; persons: number; days: number; modes: GroundMode[]; coach?: Coach }

/** bis hierhin (Luftlinie) lohnt der Vergleich mit dem Flug */
export const GROUND_MAX_KM = 700;
export const GROUND_MIN_KM = 30;
/** Reisebus ab so vielen Personen */
export const COACH_MIN = 8;

/** Wohnort der Gruppe: der Haushalt mit den meisten Mitreisenden (mit bekanntem Ort) */
export function homeOf(trip: Trip): Spot | null {
  const count = new Map<string, number>();
  for (const p of trip.travelers.filter(isActive)) {
    const k = hhKey(p);
    if (trip.households?.[k]?.geo) count.set(k, (count.get(k) || 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  const g = best && trip.households![best[0]].geo!;
  return g ? { name: g.ort, lat: g.lat, lon: g.lon } : null;
}

/** Tage der Reise (für den Reisebus), ohne Daten 2 */
export const tripDays = (trip: Trip) => (okDate(trip.from) && okDate(trip.to) ? Math.max(1, dayDiff(trip.from, trip.to) + 1) : 2);

export interface Coach { size: "mini" | "midi" | "full"; buses: number; total: number; stays: boolean }

/** Richtsätze mit Fahrer: Kleinbus bis 19, Midibus bis 35, Reisebus bis 50 Plätze */
const COACH = { mini: { day: 450, km: 1.1 }, midi: { day: 600, km: 1.4 }, full: { day: 750, km: 1.7 } };

/**
 * Reisebus: entweder bleibt der Bus mit Fahrer vor Ort (Tagessatz je Tag, Fahrerzimmer), oder er fährt zweimal
 * als Transfer (hin und leer zurück, am Ende wieder). Das Günstigere zählt.
 */
export function coachCost(persons: number, road: number, days: number): Coach {
  const size = persons <= 19 ? "mini" : persons <= 35 ? "midi" : "full";
  const buses = Math.max(1, Math.ceil(persons / 50));
  const r = COACH[size];
  const stay = days * r.day + 2 * road * r.km + (days - 1) * 90;
  const transfer = 2 * (r.day + 2 * road * r.km);
  return { size, buses, total: Math.round(Math.min(stay, transfer) * buses), stays: stay <= transfer };
}

const round = (v: number) => Math.round(v / 5) * 5 || 5;

/* ---------- Reisezeit ---------- */

/** so früh vor Abflug am Flughafen */
export const AIRPORT_EARLY = 2;
/** Aussteigen und Gepäck */
export const LANDING = 0.5;
/** zum Bahnhof bzw. Fernbus-Halt und am Ziel weiter, je Ende */
export const STATION = 0.5;

export interface FlightIn {
  from: { code: string; lat: number; lon: number };
  to: { code: string; lat: number; lon: number };
  /** Flugdauer aus dem Flug-Posten (mit Umstiegen) */
  minutes?: number;
  /** Preis pro Person hin und zurück aus dem Flug-Posten */
  pp?: number;
}

const sum = (parts: TimePart[]) => parts.reduce((a, p) => a + p.h, 0);
const mode = (k: GroundKind, parts: TimePart[], price: { lo?: number; hi?: number } = {}): GroundMode => ({ k, ...price, hours: sum(parts), parts });

/** Flug von Tür zu Tür: Auto zum Flughafen (wie bei der Anreise), 2 h vorher, Flug, Gepäck, mit Bus oder Bahn in die Stadt */
export function flightTime(home: Spot, dest: Spot, f: FlightIn): TimePart[] {
  const air = f.minutes ? f.minutes / 60 : kmBetween(f.from, f.to) / 700 + 0.5;
  return [
    { k: "access", h: (kmBetween(home, f.from) * 1.3) / 85 + 0.25 },
    { k: "early", h: AIRPORT_EARLY },
    { k: "air", h: air },
    { k: "land", h: LANDING },
    { k: "transfer", h: Math.max(0.33, (kmBetween(f.to, dest) * 1.3) / 45 + 0.25) }
  ];
}

/** Lenkpausen: Auto 15 min alle 2 h, Reisebus 45 min nach 4,5 h */
const carBreaks = (h: number) => Math.floor(h / 2) * 0.25;
const coachBreaks = (h: number) => Math.floor(h / 4.5) * 0.75;

export function groundPlan(from: Spot, to: Spot, persons: number, days: number, opts: { kmCost?: number; flight?: FlightIn } = {}): GroundPlan | null {
  const km = kmBetween(from, to);
  if (km < GROUND_MIN_KM || km > GROUND_MAX_KM) return null;
  const kmCost = opts.kmCost ?? 0.3;
  const road = km * 1.3, rail = km * 1.2, n = Math.max(1, persons);
  const pair = (lo: number, hi: number) => ({ lo: round(2 * lo), hi: round(2 * Math.max(lo, hi)) });
  const cars = Math.ceil(n / 5);
  const drive = road / 85 + 0.25, bus = road / 75 + 0.3;
  const modes: GroundMode[] = [];
  const f = opts.flight;
  if (f && f.from.code !== f.to.code) {
    modes.push({ ...mode("flight", flightTime(from, to, f), f.pp ? { lo: round(f.pp), hi: round(f.pp) } : {}), route: `${f.from.code} → ${f.to.code}`, ...(f.minutes || f.pp ? { real: true } : {}) });
  }
  modes.push(
    mode("train", [{ k: "station", h: 2 * STATION }, { k: "ride", h: rail / 130 + 0.5 }], pair(Math.max(18, 0.06 * rail + 8), Math.min(250, Math.max(30, 0.24 * rail)))),
    mode("bus", [{ k: "stop", h: 2 * STATION }, { k: "ride", h: road / 72 + 0.3 }], pair(Math.max(9, 0.035 * road + 4), Math.max(15, 0.08 * road + 8))),
    mode("car", [{ k: "ride", h: drive }, ...(carBreaks(drive) ? [{ k: "breaks" as const, h: carBreaks(drive) }] : [])], pair((road * kmCost * cars) / n, (road * kmCost * cars) / n))
  );
  let coach: Coach | undefined;
  if (n >= COACH_MIN) {
    coach = coachCost(n, road, days);
    const pp = coach.total / n;
    modes.push(mode("coach", [{ k: "ride", h: bus }, ...(coachBreaks(bus) ? [{ k: "breaks" as const, h: coachBreaks(bus) }] : [])], { lo: round(pp * 0.85), hi: round(pp * 1.2) }));
  }
  return { from, to, km, road, persons: n, days, modes, ...(coach ? { coach } : {}) };
}

/** schnellste Art von Tür zu Tür */
export const fastest = (p: GroundPlan): GroundKind => p.modes.reduce((a, b) => (b.hours < a.hours ? b : a)).k;

/** nächster Flughafen zu einem Ort (airports.json): große bis 150 km, sonst mittlere bis 80 km */
export function nearestAirport(d: AirportData, p: { lat: number; lon: number }, not?: string): { code: string; lat: number; lon: number } | null {
  const near = (size: string, max: number) => d.airports.filter(a => a[6] === size && a[0] !== not)
    .map(a => ({ code: a[0], lat: a[4], lon: a[5], km: kmBetween(p, { lat: a[4], lon: a[5] }) })).filter(a => a.km <= max).sort((a, b) => a.km - b.km)[0];
  const best = near("l", 150) || near("m", 80);
  return best ? { code: best.code, lat: best.lat, lon: best.lon } : null;
}

/* ---------- Links ---------- */

const enc = encodeURIComponent;

/** bahn.de mit Start, Ziel und Hinfahrt-Tag (8 Uhr) */
export function bahnLink(from: string, to: string, date?: string): string {
  return `https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=${enc(from)}&zo=${enc(to)}${date && okDate(date) ? `&hd=${date.slice(0, 10)}T08:00:00` : ""}`;
}
/** Google Maps: Verbindung mit Bus und Bahn (oder Auto) */
export function routeLink(from: string, to: string, mode: "transit" | "driving" = "transit"): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(from)}&destination=${enc(to)}&travelmode=${mode}`;
}
export const RAIL_LINKS = [
  { name: "Omio", url: "https://www.omio.de/" },
  { name: "Trainline", url: "https://www.thetrainline.com/de" },
  { name: "FlixBus", url: "https://www.flixbus.de/" }
];
/** Anfrage bei Busunternehmen (Bus mit Fahrer) */
export const COACH_LINKS = [
  { name: "FlixBus Mieten", url: "https://mieten.flixbus.de/" },
  { name: "11880 Busunternehmen", url: "https://www.11880.com/preisvergleich/busunternehmen" }
];

/** Posten „Reisebus“ mit Richtwert für die ganze Gruppe */
export function coachItem(p: GroundPlan): Item {
  const c = p.coach!;
  return {
    id: uid(), cat: "transport", name: t("gr.coach"), icon: "car", status: "idea",
    note: t(c.stays ? "gr.coachNoteStay" : "gr.coachNoteTransfer", { a: p.from.name, b: p.to.name, km: Math.round(p.road), n: p.days }),
    options: [{ id: uid(), label: t(`gr.size.${c.size}`), estimate: true, price: { mode: "unit", currency: "EUR", unit: c.total, qty: 1 } }]
  };
}

/**
 * Flug zum Vergleich: aus dem Flug-Posten der Reise (Flughäfen, Flugdauer, Preis pro Person mit Anfahrt zum Flughafen),
 * sonst geschätzt vom nächsten eigenen Abflughafen zum nächsten Flughafen am Ziel.
 */
export function flightIn(trip: Trip, home: Spot, dest: Spot, d: AirportData): FlightIn | null {
  const where = (code: string) => {
    const c = code.toUpperCase();
    const own = airportsOf(trip).find(a => a.code === c);
    if (own) return { code: c, lat: own.lat, lon: own.lon };
    const a = d.airports.find(x => x[0] === c);
    return a ? { code: c, lat: a[4], lon: a[5] } : null;
  };
  for (const it of trip.items) {
    if (it.cat !== "flights" || it.status === "dropped") continue;
    const r = calcItem(it, trip), out = r.option?.legs?.find(l => l.dir === "out");
    const from = out && where(out.from), to = out && where(out.to);
    if (!out || !from || !to) continue;
    return { from, to, ...(out.minutes ? { minutes: out.minutes } : {}), ...(r.n && r.net ? { pp: r.net / r.n } : {}) };
  }
  // eigene Abflughäfen (Einstellungen), liegen die alle weit weg: nächster große Flughafen
  const mine = airportsOf(trip).filter(a => a.lat != null && a.lon != null).map(a => ({ code: a.code, lat: a.lat, lon: a.lon, km: kmBetween(home, a) })).sort((a, b) => a.km - b.km)[0];
  const own = mine && mine.km <= 150 ? mine : nearestAirport(d, home) || mine;
  const to = own && nearestAirport(d, dest, own.code);
  return own && to ? { from: { code: own.code, lat: own.lat, lon: own.lon }, to } : null;
}
