/*
 * Zeitleiste oben an der Reise (#228): wer ist wann da, je Familie. Gleiche Daten wie die Rechnung (presenceOf): eigene
 * Angabe der Familie (households[…].arrive/depart), sonst aus dem Flug, sonst der Reisezeitraum.
 */
import { hhKey, isActive, type Trip } from "./model";
import { presences } from "./calc";
import { addDays, okDate, nightsList } from "./calc/travel";
import { eventDay, eventLast } from "./event/plan";

export interface TimelineRow {
  hh: string;
  /** erste Nacht und Abreisetag */
  a?: string;
  d?: string;
  /** eigene Angabe, aus dem Flug, wie die Reise (nichts bekannt) */
  src: "manual" | "flight" | "trip";
  persons: number;
}
export interface Timeline {
  start: string;
  end: string;
  nights: string[];
  rows: TimelineRow[];
  stays: { id: string; name: string; from: string; to: string }[];
  /** Event-Tage (#265): erster Tag bis Tag nach dem letzten */
  event?: { name: string; from: string; to: string };
  /** kommen und gehen alle gleich? Dann bleibt die Leiste kompakt */
  same: boolean;
}

export function timeline(trip: Trip): Timeline | null {
  const act = trip.travelers.filter(isActive);
  const pres = presences(trip);
  const hhs = [...new Set(act.map(hhKey))];
  const rows: TimelineRow[] = hhs.map(hh => {
    const ms = act.filter(t => hhKey(t) === hh);
    const ps = ms.map(t => pres[t.id]).filter(p => !!p);
    if (!ps.length) return { hh, a: okDate(trip.from) ? trip.from : undefined, d: okDate(trip.to) ? trip.to : undefined, src: "trip", persons: ms.length };
    const a = ps.map(p => p!.a).sort()[0], d = ps.map(p => p!.d).sort().at(-1)!;
    return { hh, a, d, src: ps.some(p => p!.src === "manual") ? "manual" : "flight", persons: ms.length };
  });
  const stays = trip.items.filter(it => it.cat === "stay" && it.status !== "dropped" && okDate(it.from) && okDate(it.to) && it.to! > it.from!)
    .map(it => ({ id: it.id, name: it.name, from: it.from!, to: it.to! }));
  const ev = trip.event?.start && okDate(eventDay(trip.event)) ? { name: trip.event.name, from: eventDay(trip.event), to: addDays(eventLast(trip.event), 1) } : undefined;
  const dates = [trip.from, trip.to, ...rows.flatMap(r => [r.a, r.d]), ...stays.flatMap(s => [s.from, s.to]), ...(ev ? [ev.from, ev.to] : [])].filter(okDate).sort() as string[];
  if (dates.length < 2) return null;
  const start = dates[0], end = dates.at(-1)!;
  const nights = nightsList(start, end);
  if (!nights.length || nights.length > 120) return null;
  const same = rows.every(r => r.a === rows[0].a && r.d === rows[0].d);
  return { start, end, nights, rows, stays, same, ...(ev ? { event: ev } : {}) };
}

/** eigene Anwesenheit einer Familie; der Reisezeitraum wächst mit */
export function setPresence(trip: Trip, hh: string, a: string, d: string) {
  if (!okDate(a) || !okDate(d) || d <= a) return;
  trip.households ||= {};
  trip.households[hh] = { ...(trip.households[hh] || {}), arrive: a, depart: d };
  if (!okDate(trip.from) || a < trip.from!) trip.from = a;
  if (!okDate(trip.to) || d > trip.to!) trip.to = d;
}

/** zurück auf Flug bzw. Reisezeitraum */
export function resetPresence(trip: Trip, hh: string) {
  const h = trip.households?.[hh];
  if (!h) return;
  delete h.arrive;
  delete h.depart;
}

/** Lage eines Zeitraums in Prozent der Leiste */
export function span(tl: Pick<Timeline, "nights">, a?: string, d?: string): { left: number; width: number } | null {
  if (!a || !d) return null;
  const n = tl.nights.length, i = nightsList(tl.nights[0], a).length, j = nightsList(tl.nights[0], d).length;
  const s = Math.max(0, Math.min(n, a < tl.nights[0] ? 0 : i)), e = Math.max(s, Math.min(n, j));
  return { left: (s / n) * 100, width: ((e - s) / n) * 100 };
}
