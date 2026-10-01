/*
 * Zeitfenster für Events vor Ort: von der Landung + 5 Stunden bis zum Rückflug − 5 Stunden
 * (ohne Flüge: Reise- bzw. Unterkunftsdaten). Ort aus der Reise, sonst die Stadt am Ankunftsflughafen.
 */
import type { Trip } from "../model";
import { arrivals } from "../stays/presence";

export interface EventWindow {
  city: string;
  /** Tage für die Suche (JJJJ-MM-TT) */
  from?: string;
  to?: string;
  /** genaue Grenzen (JJJJ-MM-TTTHH:MM, Ortszeit), nur aus Flügen */
  start?: string;
  end?: string;
}

/** Abstand zu Landung und Abflug */
export const BUFFER_H = 5;

function shift(iso: string, h: number): string {
  const d = new Date(`${iso.slice(0, 16)}:00Z`);
  d.setUTCHours(d.getUTCHours() + h);
  return d.toISOString().slice(0, 16);
}

export function eventWindow(trip: Trip, cityOf: (ap: string) => string = () => ""): EventWindow {
  const arr = arrivals(trip);
  const ins = arr.map(a => a.arr).filter((x): x is string => !!x && x.length >= 16).sort();
  const outs = arr.map(a => a.dep).filter((x): x is string => !!x && x.length >= 16).sort();
  let start = ins[0] ? shift(ins[0], BUFFER_H) : undefined;
  let end = outs.length ? shift(outs[outs.length - 1], -BUFFER_H) : undefined;
  if (start && end && end <= start) { start = undefined; end = undefined; }
  const stays = trip.items.filter(i => i.cat === "stay" && i.status !== "dropped" && i.from && i.to);
  const sFrom = stays.map(i => i.from!).sort()[0], sTo = stays.map(i => i.to!).sort().at(-1);
  const ap = arr.find(a => a.arrAp)?.arrAp;
  return {
    city: (trip.place || "").split(",")[0].trim() || (ap ? cityOf(ap) : ""),
    from: start?.slice(0, 10) || trip.from || sFrom || undefined,
    to: end?.slice(0, 10) || trip.to || sTo || undefined,
    ...(start ? { start } : {}), ...(end ? { end } : {})
  };
}

/** liegt ein Event (Beginn mit oder ohne Uhrzeit) im Fenster? */
export function inWindow(evStart: string, w: EventWindow): boolean {
  const timed = evStart.length >= 16;
  const day = evStart.slice(0, 10);
  if (w.start && (timed ? evStart.slice(0, 16) < w.start : day < w.start.slice(0, 10))) return false;
  if (w.end && (timed ? evStart.slice(0, 16) > w.end : day > w.end.slice(0, 10))) return false;
  if (!w.start && w.from && day < w.from) return false;
  if (!w.end && w.to && day > w.to) return false;
  return true;
}
