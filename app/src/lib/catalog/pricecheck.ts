/*
 * Preise prüfen nach dem Übernehmen aus dem Katalog (#652, Entscheidung Dani 02.11.: automatisch). Je Posten mit Richtwert
 * sucht die App wie sonst auch: Unterkunft je Station, Flug je Familie (ab den nächsten Flughäfen), Touren am Ort. Das
 * günstigste passende Angebot kommt als Option dazu und wird gewählt; der Richtwert bleibt zum Vergleich. Mietwagen und
 * Transport vor Ort haben keine Suche und bleiben Schätzung. Suchen und Optionen kommen von außen (testbar ohne Netz).
 */
import { addDays, okDate } from "../calc/travel";
import { addOffer, type Item, type Option, type Trip } from "../model";
import type { ActivityHit, ActivityQuery } from "../activities/types";
import type { FlightOffer, FlightQuery } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";

export type PriceRow = NonNullable<NonNullable<Trip["catalog"]>["check"]>["rows"][number];
type Pax = { adults: number; children: number; infants: number };

export interface PriceDeps {
  stays(q: StayQuery): Promise<StayOffer[]>;
  flights(q: FlightQuery): Promise<FlightOffer[]>;
  tours(q: ActivityQuery): Promise<ActivityHit[]>;
  /** Suche für eine Unterkunft (Gäste aus dem Posten) */
  stayQuery(trip: Trip, item: Item, place: string): StayQuery;
  /** Passagiere des Postens */
  pax(trip: Trip, ids?: string[]): Pax;
  /** Abflughäfen, nächste zuerst: ab dem Startort des Postens (aus dem Katalog), sonst ab den Wohnorten der Familien */
  homeAirports(trip: Trip, ids?: string[], home?: { name: string; lat: number; lon: number }): string[];
  /** Ziel zum Ort (Flughafen, Stadt oder Umkreis) */
  dest(place: string, near?: { lat: number; lon: number; cc?: string }): Pick<FlightQuery, "to" | "toAirports" | "toCityCode"> | null;
  stayOption(o: StayOffer, people: number, q: StayQuery): Option;
  flightOption(o: FlightOffer): Option;
  tourOption(h: ActivityHit): Option;
  lang?: string;
}

/** je Familie höchstens so viele Abflughäfen durchsuchen (jede Suche fragt alle Anbieter) */
export const MAX_APS = 2;
const MAX_PAX = 9;

/** Posten hat nur Richtwerte (noch kein Angebot) */
export const estOnly = (it: Item) => it.options.length > 0 && it.options.every(o => o.estimate);
/** Richtwert pro Person des Postens */
export const estPP = (it: Item) => Math.round(it.options.find(o => o.estimate)?.price.adult || 0);
/** Mietwagen und Transport vor Ort (ohne Anreise): keine Suche */
const noSearch = (it: Item) => it.cat === "transport" && !it.arrival;

/** Reisebeginn nachtragen: Zeitraum der Reise, Unterkünfte je Station, Touren an ihrem Tag */
export function applyStart(trip: Trip, from: string): void {
  const rel = trip.catalog?.rel;
  if (!rel || !okDate(from)) return;
  trip.from = from;
  trip.to = addDays(from, rel.nights);
  for (const it of trip.items) {
    const s = rel.stays[it.id];
    if (s) { it.from = addDays(from, s.off); it.to = addDays(from, s.off + s.n); }
    const x = rel.tours[it.id];
    if (x?.day) it.day = addDays(from, x.day - 1) + (x.time ? `T${x.time}` : "");
  }
}

/** Posten, die geprüft werden (Reihenfolge wie in der Reise) */
export function toCheck(trip: Trip): Item[] {
  const rel = trip.catalog?.rel;
  return trip.items.filter(it => it.status !== "dropped" && estOnly(it) && (
    (it.cat === "stay" && !!rel?.stays[it.id]) || (it.cat === "flights" && !it.follow) || (it.cat === "attractions" && !!rel?.tours[it.id]) || noSearch(it)));
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4);
/** passende Tour: gemeinsame Wörter im Titel, mit Preis in Euro; bei Gleichstand die günstigere */
export function matchTour(name: string, hits: ActivityHit[]): ActivityHit | null {
  const ws = words(name);
  if (!ws.length) return null;
  const scored = hits.filter(h => h.price && h.price > 0 && h.currency === "EUR")
    .map(h => ({ h, n: ws.filter(w => h.title.toLowerCase().includes(w)).length })).filter(x => x.n > 0);
  scored.sort((a, b) => b.n - a.n || a.h.price! - b.h.price!);
  return scored[0]?.h || null;
}

const cheapest = <T extends { test?: boolean }>(l: T[], price: (x: T) => number): T | null =>
  [...l.filter(x => !x.test), ...l.filter(x => x.test)].filter(x => price(x) > 0).sort((a, b) => Number(!!a.test) - Number(!!b.test) || price(a) - price(b))[0] || null;
function choose(it: Item, opt: Option) { addOffer(it, opt); it.chosen = opt.id; }

async function checkItem(trip: Trip, it: Item, d: PriceDeps): Promise<PriceRow> {
  const est = estPP(it);
  const row = (state: PriceRow["state"], pp?: number): PriceRow => ({ item: it.id, state, ...(est ? { est } : {}), ...(pp != null ? { pp: Math.round(pp) } : {}) });
  if (noSearch(it)) return row("skip");
  const rel = trip.catalog?.rel;
  if (it.cat === "stay") {
    const place = rel!.stays[it.id].place;
    if (!it.from || !it.to) return row("skip");
    const q = d.stayQuery(trip, it, place);
    const o = cheapest((await d.stays(q)).filter(x => x.currency === "EUR"), x => x.total);
    if (!o) return row("none");
    const n = q.adults + q.childAges.length;
    choose(it, d.stayOption(o, n, q));
    return row("ok", o.total / Math.max(1, n));
  }
  if (it.cat === "flights") {
    const p = d.pax(trip, it.participants);
    const n = p.adults + p.children + p.infants;
    if (!n || n > MAX_PAX || !trip.from || !trip.to) return row("skip");
    const place = Object.values(rel?.stays || {}).sort((a, b) => a.off - b.off)[0]?.place || trip.place;
    const to = d.dest(place, rel?.dest && rel.dest.place === place ? rel.dest : undefined);
    const aps = d.homeAirports(trip, it.participants, rel?.flights?.[it.id]).slice(0, MAX_APS);
    if (!to || !aps.length) return row("none");
    const all: FlightOffer[] = [];
    for (const code of aps) all.push(...await d.flights({ from: code, ...to, depart: trip.from, ret: trip.to, ...p, currency: "EUR" }));
    const o = cheapest(all.filter(x => x.currency === "EUR"), x => x.price);
    if (!o) return row("none");
    choose(it, d.flightOption(o));
    return row("ok", o.price / n);
  }
  // Tour am Ort ihres Tages
  const x = rel!.tours[it.id];
  const h = matchTour(it.name, await d.tours({ place: x.place, ...(trip.from ? { from: trip.from } : {}), ...(trip.to ? { to: trip.to } : {}), ...(d.lang ? { lang: d.lang } : {}) }));
  if (!h) return row("none");
  choose(it, d.tourOption(h));
  return row("ok", h.price);
}

/**
 * Alle Posten prüfen, nacheinander (schont die Anbieter); onRow meldet jeden Posten, sobald er fertig ist.
 * Ergebnis steht danach in trip.catalog.check.
 */
export async function checkPrices(trip: Trip, d: PriceDeps, onRow?: (r: PriceRow) => void, now = new Date()): Promise<PriceRow[]> {
  const rows: PriceRow[] = [];
  for (const it of toCheck(trip)) {
    let r: PriceRow;
    try { r = await checkItem(trip, it, d); } catch { r = { item: it.id, state: "err", ...(estPP(it) ? { est: estPP(it) } : {}) }; }
    rows.push(r);
    onRow?.(r);
  }
  if (trip.catalog) trip.catalog.check = { at: now.toISOString(), rows };
  return rows;
}

/** Summe der geprüften Posten pro Person: Richtwert und gefundene Angebote (nur Posten mit Ergebnis) */
export function checkSum(rows: PriceRow[]): { est: number; pp: number; n: number } {
  const ok = rows.filter(r => r.state === "ok" && r.pp != null && r.est != null);
  return { est: ok.reduce((a, r) => a + r.est!, 0), pp: ok.reduce((a, r) => a + r.pp!, 0), n: ok.length };
}
