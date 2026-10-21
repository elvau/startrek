/*
 * Parken am Abflughafen (#419): Suche beim Anbieter vorausfüllen. Auto abstellen 3 Stunden vor dem Hinflug, abholen
 * 1 Stunde nach der Landung des Rückflugs; Personen des Flugs nach Flug-Regel (Kleinkind unter 2, Kind 2–11, #483).
 */
import { AGE, isActive, type FlightLeg, type Item, type Trip } from "../model";
import type { ParkLinkQuery } from ".";

const shift = (iso: string, h: number) => {
  const d = new Date(`${iso.slice(0, 16)}:00Z`);
  return isNaN(d.getTime()) ? "" : new Date(d.getTime() + h * 3600000).toISOString().slice(0, 16);
};
const withTime = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);

export function parkQuery(trip: Trip, item: Item, out?: FlightLeg, back?: FlightLeg): ParkLinkQuery | undefined {
  if (!out || !back) return undefined;
  const from = withTime(out.dep) ? shift(out.dep, -3) : `${out.dep.slice(0, 10)}T06:00`;
  const end = withTime(back.arr) ? back.arr : withTime(back.dep) ? back.dep : "";
  const to = end ? shift(end, 1) : `${back.dep.slice(0, 10)}T20:00`;
  const who = trip.travelers.filter(p => isActive(p) && (!item.participants || item.participants.includes(p.id)));
  const cls = (p: (typeof who)[number]) => (p.age != null ? (p.age < AGE.child ? "infant" : p.age < AGE.adult ? "child" : "adult") : p.kind || "adult");
  const n = (k: string) => who.filter(p => cls(p) === k).length;
  return { ap: out.from.toUpperCase(), from, to, adults: n("adult"), children: n("child"), infants: n("infant") };
}
