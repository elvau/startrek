/*
 * Preise prüfen: Flüge und Unterkünfte aus der Suche genau so noch einmal suchen.
 * Für die ganze Reise: dieselben Angebote zum heutigen Preis übernehmen und die Änderung je Posten merken.
 * Je Posten auf Wunsch: ein günstigeres Angebot für dieselbe Reise suchen.
 * Gebuchte, bezahlte und verworfene Posten bleiben außen vor, ebenso eigene Einträge ohne Suche.
 */
import { t } from "./i18n/index.svelte";
import { FIXED, type Item, type Option, type Trip, type WatchHit } from "./model";
import { activeOption } from "./calc";
import { offerToOption, passengers } from "./flights/app";
import { defaultStayQuery, stayToOption } from "./stays/app";
import type { FlightOffer, FlightQuery, SearchResult } from "./flights/types";
import type { StayQuery, StaySearchResult } from "./stays/types";

const day = (iso: string) => iso.slice(0, 10);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Angebot, das beobachtet werden kann: aus einer Suche übernommen, Gesamtpreis, noch nicht gebucht */
export function watchOption(it: Item, trip: Trip): Option | null {
  if (it.status === "dropped" || FIXED.includes(it.status) || it.auto || it.follow) return null;
  if (it.cat !== "flights" && it.cat !== "stay") return null;
  const o = activeOption(it, trip);
  if (!o?.source || o.price.mode !== "unit" || !(o.price.unit! > 0)) return null;
  if (it.cat === "flights") return o.legs?.length && !o.legs.some(l => l.dir === "via") ? o : null;
  return o.price.basis === "stay" && (o.query || (it.from && it.to)) ? o : null;
}

export const watchable = (trip: Trip) => trip.items.filter(it => watchOption(it, trip));

/** genau dieser Flug: gleiche Flughäfen und Daten, gleiche Personen */
export function flightQueryFor(trip: Trip, it: Item, o: Option): FlightQuery | null {
  const out = o.legs?.find(l => l.dir === "out"), back = o.legs?.find(l => l.dir === "back");
  if (!out) return null;
  return {
    from: out.from, to: out.to, fromAirports: [out.from], toAirports: [out.to],
    depart: day(out.dep), ...(back ? { ret: day(back.dep) } : {}),
    ...passengers(trip, it.participants), currency: o.price.currency || "EUR"
  };
}

export function stayQueryFor(trip: Trip, it: Item, o: Option): StayQuery {
  const q = o.query;
  return q ? { ...q, childAges: [...q.childAges], type: "all", currency: o.price.currency || "EUR" } : { ...defaultStayQuery(trip, it, "all"), currency: o.price.currency || "EUR" };
}

const sameLeg = (a: { from: string; to: string; dep: string }, b: { from: string; to: string; dep: string }) =>
  a.from === b.from && a.to === b.to && a.dep.slice(0, 16) === b.dep.slice(0, 16);

/** dasselbe Angebot unter den neuen Treffern */
export function sameFlight(o: Option, offers: FlightOffer[]): FlightOffer | undefined {
  const out = o.legs!.find(l => l.dir === "out")!, back = o.legs!.find(l => l.dir === "back");
  const hit = offers.filter(f => sameLeg(out, f.out) && (!back ? !f.back : !!f.back && sameLeg(back, f.back)));
  return hit.sort((a, b) => a.price - b.price)[0];
}

/** ein Treffer der Nachsuche: Preis, ob er zu einem Angebot passt, als Angebot */
interface Found { price: number; same: (o: Option) => boolean; opt: () => Option }

/** genau die Suche, mit der das gewählte Angebot gefunden wurde, noch einmal */
async function lookup(trip: Trip, it: Item, o: Option, s: Searchers): Promise<Found[] | null> {
  const cur = o.price.currency || "EUR";
  if (it.cat === "flights") {
    const q = flightQueryFor(trip, it, o);
    if (!q) return null;
    const offers = (await s.flights(q)).offers.filter(f => f.currency === cur);
    return offers.map(f => ({ price: f.price, same: x => !!x.legs?.length && !x.legs.some(l => l.dir === "via") && sameFlight(x, [f]) === f, opt: () => offerToOption(f) }));
  }
  const q = stayQueryFor(trip, it, o);
  const offers = (await s.stays(q)).offers.filter(x => x.currency === cur && x.total > 0);
  return offers.map(x => ({ price: x.total, same: y => norm(y.label) === norm(x.name), opt: () => ({ ...stayToOption(x, q.adults + q.childAges.length), query: o.query }) }));
}

/** Preisänderung seit der letzten Prüfung (▲ positiv, ▼ negativ) */
export const change = (h: WatchHit) => (h.err || h.now == null ? 0 : h.now - h.was);
/** Ersparnis mit dem günstigeren Angebot */
export const saving = (h: WatchHit) => (h.err || h.best == null ? 0 : Math.max(0, (h.now ?? h.was) - h.best));

/** Ergebnis für diesen Posten, solange das gewählte Angebot noch dasselbe ist */
export function hitFor(trip: Trip, it: Item): WatchHit | null {
  const h = trip.watch?.items[it.id];
  const o = h && watchOption(it, trip);
  return h && o && o.price.unit === (h.now ?? h.was) ? h : null;
}

export const potential = (trip: Trip) => trip.items.reduce((s, it) => { const h = hitFor(trip, it); return s + (h ? saving(h) : 0); }, 0);
/** Summe der Preisänderungen der letzten Prüfung */
export const changed = (trip: Trip) => trip.items.reduce((s, it) => { const h = hitFor(trip, it); return s + (h ? change(h) : 0); }, 0);

export interface Searchers {
  flights: (q: FlightQuery) => Promise<SearchResult>;
  stays: (q: StayQuery) => Promise<StaySearchResult>;
}

/** Ergebnis der Preisprüfung für einen Posten: neue Preise je Angebot (wiedergefunden) */
export interface Refresh { hit: WatchHit; prices: Record<string, number> }

/** einen Posten nachsuchen: dieselben Angebote zum heutigen Preis */
export async function refreshItem(trip: Trip, it: Item, s: Searchers): Promise<Refresh | null> {
  const o = watchOption(it, trip);
  if (!o) return null;
  const was = o.price.unit!;
  try {
    const found = await lookup(trip, it, o, s);
    if (!found) return null;
    const prices: Record<string, number> = {};
    for (const x of it.options) {
      if (!x.source || x.price.mode !== "unit") continue;
      const m = found.filter(f => f.same(x)).sort((a, b) => a.price - b.price)[0];
      if (m) prices[x.id] = Math.round(m.price);
    }
    return { hit: prices[o.id] != null ? { was, now: prices[o.id] } : { was }, prices };
  } catch (e) {
    return { hit: { was, err: (e as Error).message || t("watch.failed") }, prices: {} };
  }
}

/** alle beobachtbaren Posten nachsuchen, höchstens zwei Suchen gleichzeitig */
export async function refreshTrip(trip: Trip, s: Searchers, progress?: (done: number, of: number) => void): Promise<Record<string, Refresh>> {
  const list = watchable(trip);
  const out: Record<string, Refresh> = {};
  let done = 0, next = 0;
  progress?.(0, list.length);
  const worker = async () => {
    while (next < list.length) {
      const it = list[next++];
      const r = await refreshItem(trip, it, s);
      if (r) out[it.id] = r;
      progress?.(++done, list.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return out;
}

/** neue Preise in die Posten schreiben und die Änderungen merken */
export function applyRefresh(trip: Trip, res: Record<string, Refresh>, at = new Date().toISOString()) {
  const items: Record<string, WatchHit> = {};
  for (const [id, r] of Object.entries(res)) {
    const it = trip.items.find(i => i.id === id);
    if (!it) continue;
    for (const o of it.options) {
      const v = r.prices[o.id];
      if (v == null) continue;
      o.price.unit = v;
      if (o.source) o.source.at = at.slice(0, 10);
    }
    items[id] = r.hit;
  }
  trip.watch = { at, items };
}

/** für einen Posten ein günstigeres Angebot suchen (dieselbe Reise, gleiche Daten und Personen) */
export async function findCheaper(trip: Trip, it: Item, s: Searchers): Promise<WatchHit | null> {
  const o = watchOption(it, trip);
  if (!o) return null;
  const now = o.price.unit!;
  const prev = hitFor(trip, it);
  const base: WatchHit = prev ? { was: prev.was, ...(prev.now != null ? { now: prev.now } : {}) } : { was: now, now };
  try {
    const found = await lookup(trip, it, o, s);
    if (!found) return null;
    const cheap = found.filter(f => !it.options.some(x => f.same(x))).sort((a, b) => a.price - b.price)[0];
    return cheap && Math.round(cheap.price) < now ? { ...base, best: Math.round(cheap.price), bestOpt: cheap.opt() } : { ...base, noBetter: true };
  } catch (e) {
    return { ...base, err: (e as Error).message || t("watch.failed") };
  }
}

/** günstigeres Angebot in den Posten übernehmen und wählen */
export function takeBetter(trip: Trip, it: Item) {
  const h = hitFor(trip, it);
  if (!h?.bestOpt) return;
  const o: Option = JSON.parse(JSON.stringify(h.bestOpt));
  it.options.push(o);
  it.chosen = o.id;
  delete trip.watch!.items[it.id];
}
