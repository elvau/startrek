/*
 * „Was wäre wenn …“ (#430): Variante mit anderem Zeitraum, anderem Abflughafen oder anderer Zahl an Nächten.
 * Erst die Daten an Reise, Flügen und Unterkünften verschieben, dann Flug und Unterkunft für die neuen Daten
 * neu suchen: dasselbe Angebot, sonst das günstigste. Ohne Treffer bleibt der alte Preis und zählt als „nicht gefunden“.
 */
import type { Trip } from "./model";
import { lookup, watchable, watchOption, type Searchers } from "./watch";

export interface WhatIf { from?: string; to?: string; airport?: string }

const DAY = 86400000;
const toT = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((toT(b) - toT(a)) / DAY);
/** Datum bzw. Ortszeit (2027-07-18T06:10) um n Tage verschieben */
export const shiftIso = (iso: string, n: number) => (n ? new Date(toT(iso) + n * DAY).toISOString().slice(0, 10) + iso.slice(10) : iso);

/** Daten und Abflughafen ändern (an der Kopie): Hinweg wie der neue Beginn, Rückweg wie das neue Ende */
export function shiftTrip(tr: Trip, w: WhatIf) {
  const oldFrom = tr.from, oldTo = tr.to;
  const from = w.from || oldFrom, to = w.to || oldTo;
  const dOut = oldFrom && from ? days(oldFrom, from) : 0, dBack = oldTo && to ? days(oldTo, to) : dOut;
  tr.from = from; tr.to = to;
  const ap = w.airport?.trim().toUpperCase();
  for (const it of tr.items) {
    if (it.cat === "flights") for (const o of it.options) for (const l of o.legs || []) {
      const n = l.dir === "back" ? dBack : dOut;
      l.dep = shiftIso(l.dep, n); l.arr = shiftIso(l.arr, n);
      if (ap && /^[A-Z]{3}$/.test(ap)) { if (l.dir === "out") l.from = ap; if (l.dir === "back") l.to = ap; }
    }
    if (it.cat === "stay") {
      const sh = (d: string | undefined, old: string | undefined, nu: string | undefined, n: number) => (d && d === old ? nu : d ? shiftIso(d, n) : d);
      it.from = sh(it.from, oldFrom, from, dOut); it.to = sh(it.to, oldTo, to, dBack);
      for (const o of it.options) if (o.query) { o.query.checkin = sh(o.query.checkin, oldFrom, from, dOut)!; o.query.checkout = sh(o.query.checkout, oldTo, to, dBack)!; }
    }
  }
  delete tr.watch;
}

/** Flüge und Unterkünfte für die neuen Daten neu suchen; gibt zurück, wie viele neu bzw. nicht gefunden wurden */
export async function requote(tr: Trip, s: Searchers): Promise<{ done: number; failed: number }> {
  let done = 0, failed = 0;
  for (const it of watchable(tr)) {
    const o = watchOption(it, tr)!;
    try {
      const found = (await lookup(tr, it, o, s)) || [];
      const pick = found.filter(f => f.same(o)).sort((a, b) => a.price - b.price)[0] ?? [...found].sort((a, b) => a.price - b.price)[0];
      if (!pick) { failed++; continue; }
      const nu = pick.opt();
      it.options = [nu];
      it.chosen = nu.id;
      done++;
    } catch { failed++; }
  }
  return { done, failed };
}
