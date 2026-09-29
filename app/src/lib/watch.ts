/*
 * Reisebeobachtung: Flüge und Unterkünfte aus der Suche genau so noch einmal suchen.
 * Je Posten: dasselbe Angebot heute (teurer/günstiger) und das günstigste Angebot für dieselbe Reise.
 * Gebuchte, bezahlte und verworfene Posten bleiben außen vor, ebenso eigene Einträge ohne Suche.
 */
import { t } from "./i18n/index.svelte";
import { FIXED, type Item, type Option, type Trip, type TripWatch, type WatchHit } from "./model";
import { activeOption } from "./calc";
import { offerToOption, passengers } from "./flights/app";
import { defaultStayQuery, stayToOption } from "./stays/app";
import type { FlightOffer, FlightQuery, SearchResult } from "./flights/types";
import type { StayOffer, StayQuery, StaySearchResult } from "./stays/types";

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

export function sameStay(o: Option, offers: StayOffer[]): StayOffer | undefined {
  const n = norm(o.label);
  return offers.filter(s => norm(s.name) === n).sort((a, b) => a.total - b.total)[0];
}

/** Vergleich für einen Posten aus den neuen Treffern (Preise in der Währung des Angebots) */
export function compare(was: number, now: number | undefined, cheapest: { price: number; opt: () => Option } | undefined): WatchHit {
  const hit: WatchHit = { was };
  if (now != null) hit.now = Math.round(now);
  const ref = Math.min(was, now ?? was);
  if (cheapest && Math.round(cheapest.price) < ref) { hit.best = Math.round(cheapest.price); hit.bestOpt = cheapest.opt(); }
  return hit;
}

/** Ersparnis gegenüber dem Preis beim Übernehmen (0, wenn nichts günstiger ist) */
export const saving = (h: WatchHit) => h.err ? 0 : Math.max(0, h.was - Math.min(h.now ?? h.was, h.best ?? Infinity));
/** Aufschlag, wenn dasselbe Angebot teurer geworden ist */
export const rise = (h: WatchHit) => h.err || h.now == null ? 0 : Math.max(0, h.now - h.was);

/** Ergebnis für diesen Posten, solange das gewählte Angebot noch dasselbe ist */
export function hitFor(trip: Trip, it: Item): WatchHit | null {
  const h = trip.watch?.items[it.id];
  const o = h && watchOption(it, trip);
  return h && o && o.price.unit === h.was ? h : null;
}

export const potential = (trip: Trip) => trip.items.reduce((s, it) => { const h = hitFor(trip, it); return s + (h ? saving(h) : 0); }, 0);
export const rises = (trip: Trip) => trip.items.reduce((s, it) => { const h = hitFor(trip, it); return s + (h ? rise(h) : 0); }, 0);

export interface Searchers {
  flights: (q: FlightQuery) => Promise<SearchResult>;
  stays: (q: StayQuery) => Promise<StaySearchResult>;
}

/** einen Posten nachsuchen */
export async function checkItem(trip: Trip, it: Item, s: Searchers): Promise<WatchHit | null> {
  const o = watchOption(it, trip);
  if (!o) return null;
  const was = o.price.unit!;
  const cur = o.price.currency || "EUR";
  try {
    if (it.cat === "flights") {
      const q = flightQueryFor(trip, it, o);
      if (!q) return null;
      const offers = (await s.flights(q)).offers.filter(f => f.currency === cur);
      const same = sameFlight(o, offers);
      const cheap = offers.slice().sort((a, b) => a.price - b.price)[0];
      return compare(was, same?.price, cheap && { price: cheap.price, opt: () => offerToOption(cheap) });
    }
    const q = stayQueryFor(trip, it, o);
    const offers = (await s.stays(q)).offers.filter(x => x.currency === cur && x.total > 0);
    const same = sameStay(o, offers);
    const cheap = offers.slice().sort((a, b) => a.total - b.total)[0];
    return compare(was, same?.total, cheap && { price: cheap.total, opt: () => ({ ...stayToOption(cheap, q.adults + q.childAges.length), query: o.query }) });
  } catch (e) {
    return { was, err: (e as Error).message || t("watch.failed") };
  }
}

/** alle beobachtbaren Posten nachsuchen, höchstens zwei Suchen gleichzeitig */
export async function checkTrip(trip: Trip, s: Searchers, progress?: (done: number, of: number) => void): Promise<TripWatch> {
  const list = watchable(trip);
  const items: Record<string, WatchHit> = {};
  let done = 0, next = 0;
  progress?.(0, list.length);
  const worker = async () => {
    while (next < list.length) {
      const it = list[next++];
      const h = await checkItem(trip, it, s);
      if (h) items[it.id] = h;
      progress?.(++done, list.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return { at: new Date().toISOString(), items };
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
