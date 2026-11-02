/*
 * Reisekatalog ansehen (#646): Karten mit Preis ab dem eigenen Wohnort, Route als Flussdiagramm, Filter und Bänder nach
 * Entfernung, Kostenzeilen für die Detailansicht. Rein rechnend; die Oberfläche ist ui/Catalog.svelte.
 */
import { arrivalFor, bandOf, FLY_KM, type ArrivalEst, type ArrivalOpts, type DistBand, type LatLon } from "./arrival";
import { kmBetween } from "../geo/places";
import { corePP, toursPP, type CatalogBy, type CatalogEntry, type CatalogKind } from "./types";

/** Startort des Betrachters: Wohnort oder Rückfall (Hauptstadt des Landes) */
export interface Origin extends LatLon { cc?: string; name: string }

/** ein Halt der Route: Startort, Stationen, zurück */
export interface RouteNode { cc?: string; name: string; nights?: number; by?: CatalogBy; home?: boolean }

export interface CatalogCard {
  e: CatalogEntry;
  km: number | null;
  band: DistBand | null;
  arrival: ArrivalEst | null;
  /** Ziel + Anreise pro Person, ohne Touren */
  pp: number;
  tours: number;
  route: RouteNode[];
}

/** Wer reist: allein, zu zweit, Familie (mit Kindern), Gruppe (ab 3 Erwachsenen ohne Kinder) */
export type Who = "solo" | "pair" | "family" | "group";
export const WHO: Who[] = ["solo", "pair", "family", "group"];
export function whoOf(g: CatalogEntry["group"]): Who {
  if (g.children + g.infants > 0) return "family";
  return g.adults <= 1 ? "solo" : g.adults === 2 ? "pair" : "group";
}

/** Dauer in Nächten: Kurztrip, knappe Woche, Woche bis 10, länger */
export type Len = "short" | "mid" | "week" | "long";
export const LENS: Len[] = ["short", "mid", "week", "long"];
export const lenOf = (n: number): Len => (n <= 3 ? "short" : n <= 6 ? "mid" : n <= 10 ? "week" : "long");

export interface CatalogFilter {
  who?: Who[];
  kind?: CatalogKind[];
  /** Reisemonat (1–12): nur passende Einträge, Anreise mit Saison dieses Monats */
  month?: number;
  len?: Len[];
  /** höchstens so viel pro Person inklusive Anreise */
  budget?: number;
}

/** Verkehrsmittel der Anreise für das Flussdiagramm */
function arrivalBy(e: CatalogEntry, a: ArrivalEst | null): CatalogBy | undefined {
  if (!a) return undefined;
  if (a.mode === "flight") return "plane";
  if (e.move?.includes("camper")) return "camper";
  if (e.kind === "road" || e.move?.includes("car")) return "car";
  return "train";
}

/** Route: Startort → Stationen (gleicher Ort direkt hintereinander nur einmal), mit Rückweg für die Detailansicht */
export function routeOf(e: CatalogEntry, origin: Origin | null, a: ArrivalEst | null, back = false): RouteNode[] {
  const out: RouteNode[] = [];
  if (origin) out.push({ cc: origin.cc, name: origin.name, home: true });
  e.stops.forEach((s, i) => {
    const by = i === 0 ? arrivalBy(e, a) : s.by;
    out.push({ ...(s.cc ? { cc: s.cc } : {}), name: s.place, ...(s.nights ? { nights: s.nights } : {}), ...(by && (i > 0 || origin) ? { by } : {}) });
  });
  if (back && origin) {
    const last = e.stops.at(-1);
    const backBy = e.kind === "cruise" && a?.mode === "flight" ? "plane" : arrivalBy(e, a);
    if (last) out.push({ cc: origin.cc, name: origin.name, home: true, ...(backBy ? { by: backBy } : {}) });
  }
  return out;
}

export function cardOf(e: CatalogEntry, origin: Origin | null, opts: ArrivalOpts & { month?: number } = {}): CatalogCard {
  const s = e.stops[0];
  const km = origin && s?.lat != null && s?.lon != null ? Math.round(kmBetween(origin, { lat: s.lat, lon: s.lon })) : null;
  const arrival = origin ? arrivalFor(e, origin, opts.month, opts) : null;
  return { e, km, band: km == null ? null : bandOf(km, opts.flyKm || FLY_KM), arrival, pp: corePP(e) + (arrival?.pp || 0), tours: toursPP(e), route: routeOf(e, origin, arrival) };
}

export function matches(c: CatalogCard, f: CatalogFilter): boolean {
  if (f.who?.length && !f.who.includes(whoOf(c.e.group))) return false;
  if (f.kind?.length && !f.kind.includes(c.e.kind)) return false;
  if (f.month && c.e.months.length && !c.e.months.includes(f.month)) return false;
  if (f.len?.length && !f.len.includes(lenOf(c.e.nights))) return false;
  if (f.budget && c.pp > f.budget) return false;
  return true;
}

export interface CatalogBand { band: DistBand | null; cards: CatalogCard[] }

/** Karten gefiltert, nach Luftlinie sortiert und in Bänder gruppiert; ohne Startort eine Liste nach Titel */
export function catalogBands(list: CatalogEntry[], origin: Origin | null, f: CatalogFilter = {}, opts: ArrivalOpts = {}): CatalogBand[] {
  const cards = list.map(e => cardOf(e, origin, { ...opts, month: f.month })).filter(c => matches(c, f));
  if (!origin) return cards.length ? [{ band: null, cards: cards.sort((a, b) => a.e.title.localeCompare(b.e.title)) }] : [];
  cards.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  const out: CatalogBand[] = [];
  for (const c of cards) {
    const last = out.at(-1);
    if (last && last.band === c.band) last.cards.push(c);
    else out.push({ band: c.band, cards: [c] });
  }
  return out;
}

/** Kostenzeilen der Detailansicht pro Person: Anreise (geschätzt), Flüge unterwegs, Unterkunft, vor Ort, Erlebnisse im Preis, Verpflegung, Sonstiges */
export type CostKey = "arrival" | "flights" | "stay" | "local" | "core" | "food" | "other";
export interface CostRow { key: CostKey; pp: number; est?: boolean; labels: string[] }
const FOOD = /essen|verpflegung|mittagessen|food|meal|hütten/i;

export function costRows(e: CatalogEntry, a: ArrivalEst | null): CostRow[] {
  const rows = new Map<CostKey, CostRow>();
  const add = (key: CostKey, pp: number, label?: string, est?: boolean) => {
    const r = rows.get(key) || { key, pp: 0, labels: [], ...(est ? { est } : {}) };
    r.pp += pp;
    if (label) r.labels.push(label);
    rows.set(key, r);
  };
  if (a) add("arrival", a.pp, undefined, true);
  for (const c of e.costs) {
    const key: CostKey = c.cat === "flights" ? "flights" : c.cat === "stay" ? "stay" : c.cat === "transport" ? "local" : c.cat === "attractions" ? "core"
      : c.auto === "food" || FOOD.test(c.label || "") ? "food" : "other";
    add(key, c.pp, c.label);
  }
  const order: CostKey[] = ["arrival", "flights", "stay", "local", "core", "food", "other"];
  return order.filter(k => rows.has(k)).map(k => ({ ...rows.get(k)!, pp: Math.round(rows.get(k)!.pp) }));
}
