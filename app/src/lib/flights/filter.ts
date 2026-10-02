/*
 * Treffer der Flugsuche filtern und sortieren, ohne neue Anfrage: Umstiege, Abflughafen, Airline, Uhrzeiten,
 * Flugdauer und Reisetage (Kalender). Zu jedem Filter die Auswahl mit Anzahl und Preis ab („Direkt · 4 · ab 89 €“).
 */

/** was der Filter von einem Treffer braucht (FlightOffer mit Bewertung, siehe Rated) */
export interface Filterable {
  id: string;
  origin: string;
  total: number;
  out: { dep: string; arr: string; minutes: number; stops: number; carriers: string[] };
  back?: { dep: string; arr: string; minutes: number; stops: number; carriers: string[] };
  accessHours: number;
}

export interface FlightFilter {
  /** höchstens so viele Umstiege je Richtung; null: egal */
  stops: number | null;
  /** nur diese Abflughäfen bzw. Airlines; leer: alle */
  origins: string[];
  airlines: string[];
  /** Abflugzeit in Stunden (0–24) */
  outDep: [number, number];
  backDep: [number, number];
  /** höchstens so viele Stunden je Richtung; null: egal */
  maxHours: number | null;
  /** Reisetage aus dem Kalender (JJJJ-MM-TT) */
  outDay: string | null;
  backDay: string | null;
}

export const noFilter = (): FlightFilter => ({ stops: null, origins: [], airlines: [], outDep: [0, 24], backDep: [0, 24], maxHours: null, outDay: null, backDay: null });

export type FlightSort = "price" | "best" | "time" | "arrival";

const hourOf = (iso: string) => { const h = +iso.slice(11, 13), m = +iso.slice(14, 16); return isNaN(h) ? NaN : h + (m || 0) / 60; };
const inHours = (iso: string, [a, b]: [number, number]) => { if (a <= 0 && b >= 24) return true; const h = hourOf(iso); return isNaN(h) || (h >= a && h <= b); };
const legs = (o: Filterable) => (o.back ? [o.out, o.back] : [o.out]);
export const maxStopsOf = (o: Filterable) => Math.max(...legs(o).map(l => l.stops));
export const airlinesOf = (o: Filterable) => [...new Set(legs(o).flatMap(l => l.carriers))];
export const dayOf = (iso: string) => iso.slice(0, 10);

/** Treffer passt zum Filter; skip lässt einen Filter weg (für die Anzahl an seiner eigenen Auswahl) */
export function passes(o: Filterable, f: FlightFilter, ...skip: (keyof FlightFilter)[]): boolean {
  const on = (k: keyof FlightFilter) => !skip.includes(k);
  if (on("stops") && f.stops != null && maxStopsOf(o) > f.stops) return false;
  if (on("origins") && f.origins.length && !f.origins.includes(o.origin)) return false;
  if (on("airlines") && f.airlines.length && !airlinesOf(o).some(c => f.airlines.includes(c))) return false;
  if (on("outDep") && !inHours(o.out.dep, f.outDep)) return false;
  if (on("backDep") && o.back && !inHours(o.back.dep, f.backDep)) return false;
  if (on("maxHours") && f.maxHours != null && legs(o).some(l => l.minutes > f.maxHours! * 60)) return false;
  if (on("outDay") && f.outDay && dayOf(o.out.dep) !== f.outDay) return false;
  if (on("backDay") && f.backDay && (!o.back || dayOf(o.back.dep) !== f.backDay)) return false;
  return true;
}

export const applyFilter = <T extends Filterable>(list: T[], f: FlightFilter) => list.filter(o => passes(o, f));

/** wie viele Filter vom Standard abweichen (Kalendertage zählen nicht, die zeigt der Kalender selbst) */
export function activeCount(f: FlightFilter): number {
  const d = noFilter();
  return [f.stops != null, f.origins.length > 0, f.airlines.length > 0, f.outDep[0] !== d.outDep[0] || f.outDep[1] !== d.outDep[1],
    f.backDep[0] !== d.backDep[0] || f.backDep[1] !== d.backDep[1], f.maxHours != null].filter(Boolean).length;
}

export interface Facet<K> { key: K; count: number; min: number }

function facet<T extends Filterable, K>(list: T[], f: FlightFilter, skip: keyof FlightFilter, keys: (o: T) => K[]): Facet<K>[] {
  const m = new Map<K, Facet<K>>();
  for (const o of list) {
    if (!passes(o, f, skip)) continue;
    for (const k of keys(o)) {
      const x = m.get(k);
      if (x) { x.count++; x.min = Math.min(x.min, o.total); } else m.set(k, { key: k, count: 1, min: o.total });
    }
  }
  return [...m.values()];
}

/** Auswahl je Filter mit Anzahl und Preis ab, gerechnet mit allen anderen Filtern */
export function facets<T extends Filterable>(list: T[], f: FlightFilter) {
  // Umstiege kumulativ: „höchstens 1“ enthält die Direktflüge
  const st = facet(list, f, "stops", o => [maxStopsOf(o)]);
  const stops = [0, 1, 2].map(n => {
    const xs = st.filter(x => x.key <= n);
    return { key: n, count: xs.reduce((v, x) => v + x.count, 0), min: Math.min(...xs.map(x => x.min)) };
  }).filter((x, i, a) => x.count > 0 && (i === 0 || x.count > a[i - 1].count));
  return {
    stops,
    origins: facet(list, f, "origins", o => [o.origin]).sort((a, b) => a.min - b.min),
    airlines: facet(list, f, "airlines", o => airlinesOf(o)).sort((a, b) => a.min - b.min),
    /** längste Flugdauer je Richtung (für den Regler), in ganzen Stunden */
    longest: Math.ceil(Math.max(0, ...list.map(o => Math.max(...legs(o).map(l => l.minutes)))) / 60)
  };
}

/** Kalender: je Tag der günstigste Preis und die wenigsten Umstiege (Hinflug, oder Rückflug zum gewählten Hinflug) */
export interface DayCell { day: string; min: number; stops: number; count: number }

export function dayCells<T extends Filterable>(list: T[], f: FlightFilter, which: "out" | "back"): DayCell[] {
  const m = new Map<string, DayCell>();
  for (const o of list) {
    const leg = which === "out" ? o.out : o.back;
    // Hinflug-Tage unabhängig von den gewählten Tagen; Rückflug-Tage nur zum gewählten Hinflug-Tag
    if (!leg || !(which === "out" ? passes(o, f, "outDay", "backDay") : passes(o, f, "backDay"))) continue;
    const d = dayOf(leg.dep), s = maxStopsOf(o), x = m.get(d);
    if (x) { x.count++; if (o.total < x.min) x.min = o.total; x.stops = Math.min(x.stops, s); }
    else m.set(d, { day: d, min: o.total, stops: s, count: 1 });
  }
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Preisstufe für die Farbe: 0 günstig, 1 mittel, 2 teuer (Drittel zwischen günstigstem und teuerstem Tag) */
export function tier(min: number, cells: DayCell[]): 0 | 1 | 2 {
  const lo = Math.min(...cells.map(c => c.min)), hi = Math.max(...cells.map(c => c.min));
  if (hi - lo < 1) return 0;
  const p = (min - lo) / (hi - lo);
  return p < 1 / 3 ? 0 : p < 2 / 3 ? 1 : 2;
}

const travelMin = (o: Filterable) => legs(o).reduce((v, l) => v + l.minutes, 0) + 120 * o.accessHours;

/**
 * Sortieren: günstigste, beste (Preis mit Aufschlag für Reisezeit und Umstiege), schnellste, früheste Ankunft.
 * „Beste“: jede Stunde unterwegs zählt wie 15 € pro Treffer, jeder Umstieg wie 30 €.
 */
export function sortFlights<T extends Filterable>(list: T[], sort: FlightSort): T[] {
  const l = [...list];
  if (sort === "time") return l.sort((a, b) => travelMin(a) - travelMin(b) || a.total - b.total);
  if (sort === "arrival") return l.sort((a, b) => a.out.arr.localeCompare(b.out.arr) || a.total - b.total);
  if (sort === "best") {
    const score = (o: Filterable) => o.total + (travelMin(o) / 60) * 15 + legs(o).reduce((v, x) => v + x.stops, 0) * 30;
    return l.sort((a, b) => score(a) - score(b));
  }
  return l.sort((a, b) => a.total - b.total);
}
