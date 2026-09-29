/*
 * Reise auf einen Blick (Startseite): wohin oder Rundreise, Zeitraum, Events, Verpflegung, geschätzte Kosten,
 * und ob sie geplant, gebucht oder vergangen ist.
 */
import { FIXED, type FoodStyle, type Trip } from "./model";
import { totals } from "./calc";
import { foodCfg } from "./food";
import { nights } from "./format";
import { airportOf, type GeoData } from "./geo/places";
import { potential } from "./watch";

export type TripState = "planned" | "booked" | "past";

export interface TripSummary {
  /** Ziel; bei einer Rundreise über mehrere Länder deren Namen */
  where: string;
  round: boolean;
  nights: number;
  /** Event der Reise und Erlebnisse */
  events: number;
  /** Verpflegung: ein Stil für alle, "hh" je Familie verschieden, null nicht geplant */
  food: FoodStyle | "hh" | null;
  total: number;
  /** Reisebeobachtung: mögliche Ersparnis */
  potential: number;
  state: TripState;
}

/** Länder der Flugziele (Hinflug und weitere Flüge), in Reihenfolge; braucht die Weltdaten */
export function countries(trip: Trip, g: GeoData, lang = "de"): string[] {
  const out: string[] = [];
  for (const it of trip.items) {
    if (it.cat !== "flights" || it.status === "dropped") continue;
    const o = it.options.find(x => x.id === it.chosen) || it.options[0];
    for (const l of o?.legs || []) {
      if (l.dir === "back") continue;
      const cc = airportOf(g, l.to)?.cc;
      const w = cc ? g.world.find(x => x.k === cc) : undefined;
      const name = w ? (lang === "de" ? w.l : w.en) : "";
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** gebucht: es gibt Flüge oder Unterkünfte, und alle davon sind gebucht oder bezahlt */
export function isBooked(trip: Trip): boolean {
  const main = trip.items.filter(i => (i.cat === "flights" || i.cat === "stay") && i.status !== "dropped" && !i.auto);
  return main.length > 0 && main.every(i => FIXED.includes(i.status));
}

export function summarize(trip: Trip, today: string, g?: GeoData, lang = "de"): TripSummary {
  const cs = g ? countries(trip, g, lang) : [];
  const round = cs.length > 1;
  const cfg = foodCfg(trip);
  const styles = new Set([cfg.style, ...Object.values(cfg.hh || {})]);
  const end = trip.to || trip.from;
  return {
    where: round ? cs.join(", ") : [trip.place, trip.country].filter(Boolean).join(", "),
    round,
    nights: trip.from && trip.to ? nights(trip.from, trip.to) : 0,
    events: (trip.event ? 1 : 0) + trip.items.filter(i => i.cat === "attractions" && i.status !== "dropped").length,
    food: trip.food?.on ? (styles.size > 1 ? "hh" : cfg.style) : null,
    total: totals(trip).total,
    potential: potential(trip),
    state: end && end < today ? "past" : isBooked(trip) ? "booked" : "planned"
  };
}
