/*
 * Bahn, Fernbus, Auto und Reisebus statt Flug: bei Zielen bis etwa 700 km Luftlinie vom Wohnort der Gruppe.
 * Richtwerte pro Person für Hin- und Rückfahrt (grob, keine Fahrplanauskunft), dazu Links zur Suche.
 * Reisebus ab 8 Personen: Tagessatz plus Kilometer, geteilt durch die Gruppe.
 */
import { t } from "./i18n/index.svelte";
import { hhKey, isActive, uid, type Item, type Trip } from "./model";
import { kmBetween } from "./geo/places";
import { dayDiff, okDate } from "./calc/travel";

export interface Spot { name: string; lat: number; lon: number }

export type GroundKind = "train" | "bus" | "car" | "coach";
export interface GroundMode {
  k: GroundKind;
  /** Euro pro Person, hin und zurück */
  lo: number;
  hi: number;
  /** Fahrzeit eine Richtung in Stunden */
  hours: number;
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

export function groundPlan(from: Spot, to: Spot, persons: number, days: number, kmCost = 0.3): GroundPlan | null {
  const km = kmBetween(from, to);
  if (km < GROUND_MIN_KM || km > GROUND_MAX_KM) return null;
  const road = km * 1.3, rail = km * 1.2, n = Math.max(1, persons);
  const pair = (lo: number, hi: number) => ({ lo: round(2 * lo), hi: round(2 * Math.max(lo, hi)) });
  const cars = Math.ceil(n / 5);
  const modes: GroundMode[] = [
    { k: "train", ...pair(Math.max(18, 0.06 * rail + 8), Math.min(250, Math.max(30, 0.24 * rail))), hours: rail / 130 + 0.5 },
    { k: "bus", ...pair(Math.max(9, 0.035 * road + 4), Math.max(15, 0.08 * road + 8)), hours: road / 72 + 0.3 },
    { k: "car", ...pair((road * kmCost * cars) / n, (road * kmCost * cars) / n), hours: road / 85 + 0.25 }
  ];
  let coach: Coach | undefined;
  if (n >= COACH_MIN) {
    coach = coachCost(n, road, days);
    const pp = coach.total / n;
    modes.push({ k: "coach", lo: round(pp * 0.85), hi: round(pp * 1.2), hours: road / 75 + 0.3 });
  }
  return { from, to, km, road, persons: n, days, modes, ...(coach ? { coach } : {}) };
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
