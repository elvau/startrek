/*
 * Vergleichsansicht (#430): Varianten nebeneinander, Zeilen nach Kapiteln. Versteckte Kosten (Verpflegung, Souvenirs)
 * stehen in einer eigenen Zeile statt unter Sonstiges; die Zeilen ergeben zusammen den Gesamtbetrag der Reise.
 */
import { CAT_KEYS, type CatKey, type Trip } from "./model";
import { totals } from "./calc";
import { tripFacts } from "./cruises/land";

export type RowKey = CatKey | "hidden";
export const ROWS: RowKey[] = [...CAT_KEYS, "hidden"];
export interface Cell { sum: number; names: string[] }
export interface Col { id: string; total: number; perPerson: number; people: number; cells: Record<RowKey, Cell>; facts?: { places: number; hours: number; cruise: boolean } }

const HIDDEN = new Set(["food", "souvenir"]);

/** Spalte einer Variante: Summen je Kapitel mit Posten (größte zuerst), versteckte Kosten extra */
export function column(trip: Trip): Col {
  const T = totals(trip);
  const cells = Object.fromEntries(ROWS.map(k => [k, { sum: 0, names: [] as string[] }])) as Record<RowKey, Cell>;
  const named: Record<RowKey, [string, number][]> = Object.fromEntries(ROWS.map(k => [k, []])) as unknown as Record<RowKey, [string, number][]>;
  for (const k of CAT_KEYS) cells[k].sum = T.byCat[k] || 0;
  for (const it of trip.items) {
    const r = T.items[it.id];
    if (!r?.counts || !(r.net > 0)) continue;
    if (it.auto && HIDDEN.has(it.auto)) {
      cells[it.cat].sum -= r.net;
      cells.hidden.sum += r.net;
      named.hidden.push([it.name, r.net]);
    } else named[it.cat].push([it.name, r.net]);
  }
  for (const k of CAT_KEYS) {
    if (T.simple[k]) named[k].push(["", T.simple[k]!]);
    for (const l of trip.lines || []) if (l.cat === k && l.amount > 0) named[k].push([l.label, l.amount]);
  }
  for (const k of ROWS) {
    cells[k].sum = Math.max(0, Math.round(cells[k].sum * 100) / 100);
    cells[k].names = named[k].sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(Boolean);
  }
  const people = Math.max(1, T.active);
  const facts = tripFacts(trip);
  return { id: trip.id, total: T.total, perPerson: T.total / people, people, cells, ...(facts ? { facts } : {}) };
}

/** günstigste Spalte (Gesamt) und je Zeile das Minimum */
export const cheapestId = (cols: Col[]) => (cols.length > 1 ? cols.reduce((a, c) => (c.total < a.total ? c : a)).id : "");
export const rowMin = (cols: Col[], k: RowKey) => Math.min(...cols.map(c => c.cells[k].sum));
export const rowSpread = (cols: Col[], k: RowKey) => Math.max(...cols.map(c => c.cells[k].sum)) - rowMin(cols, k);

/** Zeilen, in denen sich die Varianten um mindestens 1 € unterscheiden; leere Zeilen (überall 0) nie */
export function shownRows(cols: Col[], onlyDiff: boolean): RowKey[] {
  return ROWS.filter(k => cols.some(c => c.cells[k].sum > 0) && (!onlyDiff || rowSpread(cols, k) >= 1));
}

/** Varianten derselben Reise mit einer Änderung (gleicher Ort und gleiches Land): standardmäßig nur Unterschiede */
export const sameTrip = (trips: Pick<Trip, "place" | "country">[]) =>
  trips.length > 1 && trips.every(t => (t.place || "") === (trips[0].place || "") && (t.country || "") === (trips[0].country || ""));

/** Unterschied einer Variante zur günstigsten: gesamt und je Zeile (größte zuerst, ab 1 €) */
export function explain(ref: Col, c: Col): { total: number; parts: [RowKey, number][] } {
  const parts = ROWS.map(k => [k, c.cells[k].sum - ref.cells[k].sum] as [RowKey, number]).filter(([, d]) => Math.abs(d) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return { total: c.total - ref.total, parts };
}
