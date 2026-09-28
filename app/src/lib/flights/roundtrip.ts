/*
 * Rundreise aus einzelnen Flügen: DUS → Rio (5–8 Nächte) → Buenos Aires (4–6 Nächte) → DUS.
 * Jede Strecke wird als Hinflug mit Zeitfenster gesucht, Stufe für Stufe: die Ankunftstage der günstigsten
 * bisherigen Kombinationen bestimmen das Fenster der nächsten Strecke (Nächte vor Ort von–bis).
 * Getrennte Tickets: jeder Flug wird einzeln gebucht.
 */
import { addDays } from "./kiwi";
import type { FlightOffer, FlightQuery, SearchResult, SourceStatus } from "./types";

/** ein Ort als Liste von Codes (ein Flughafen, alle einer Stadt oder im Umkreis) */
export interface RoundPlace { name: string; code: string; airports: string[]; cityCode?: string }
export interface RoundStop { place: RoundPlace; min: number; max: number }

export interface RoundPlan {
  from: RoundPlace;
  stops: RoundStop[];
  /** am Ende zurück zum Start; sonst endet die Reise an der letzten Station */
  home: boolean;
  /** Abflug der ersten Strecke zwischen depart und departTo */
  depart: string;
  departTo: string;
  adults: number;
  children: number;
  infants: number;
  maxStops?: number;
  bags?: boolean;
  selfTransfer?: boolean;
  currency?: string;
}

export interface RoundTrip {
  id: string;
  legs: FlightOffer[];
  price: number;
  /** Nächte an jeder Station */
  nights: number[];
}

export interface RoundResult { trips: RoundTrip[]; sources: SourceStatus[]; errors: string[] }

/** Strecken der Reise: Start → Station 1 → … → (Start) */
export function roundLegs(p: RoundPlan): [RoundPlace, RoundPlace][] {
  const pts = [p.from, ...p.stops.map(s => s.place), ...(p.home ? [p.from] : [])];
  return pts.slice(1).map((to, i) => [pts[i], to]);
}

const dayOf = (iso: string) => iso.slice(0, 10);
export const nightsBetween = (arr: string, dep: string) => Math.round((Date.parse(dayOf(dep)) - Date.parse(dayOf(arr))) / 86400000);

/** Anfrage für eine Strecke: Hinflug im Zeitfenster, Orte als Code-Listen */
export function legQuery(p: RoundPlan, from: RoundPlace, to: RoundPlace, depart: string, departTo: string): FlightQuery {
  return {
    from: from.code, to: to.code, fromAirports: from.airports, toAirports: to.airports,
    ...(from.cityCode ? { fromCityCode: from.cityCode } : {}), ...(to.cityCode ? { toCityCode: to.cityCode } : {}),
    depart, ...(departTo > depart ? { departTo } : {}),
    adults: p.adults, children: p.children, infants: p.infants,
    ...(p.maxStops != null ? { maxStops: p.maxStops } : {}), ...(p.bags != null ? { bags: p.bags } : {}),
    ...(p.selfTransfer != null ? { selfTransfer: p.selfTransfer } : {}), currency: p.currency || "EUR"
  };
}

/** wie viele Kombinationen je Stufe weiterverfolgt werden und wie viele Ankunftstage eine eigene Suche bekommen */
const KEEP = 30, DAYS = 3;

/**
 * Suche Stufe für Stufe. Stufe 1: Fenster aus dem Plan. Danach je Ankunftstag der günstigsten Kombinationen
 * (höchstens DAYS) eine Suche mit Abflug zwischen Ankunft + min und Ankunft + max Nächten.
 */
export async function searchRound(p: RoundPlan, search: (q: FlightQuery) => Promise<SearchResult>, progress?: (leg: number, of: number) => void): Promise<RoundResult> {
  const legs = roundLegs(p);
  const sources = new Map<string, SourceStatus>();
  const errors: string[] = [];
  const note = (r: SearchResult) => r.sources.forEach(s => { const o = sources.get(s.id); sources.set(s.id, o ? { ...o, ok: o.ok || s.ok, count: o.count + s.count, error: o.ok ? o.error : s.error } : { ...s }); });
  let partial: { legs: FlightOffer[]; price: number }[] = [{ legs: [], price: 0 }];

  for (const [k, [from, to]] of legs.entries()) {
    progress?.(k + 1, legs.length);
    const stop = k > 0 ? p.stops[k - 1] : null;
    // Zeitfenster: erste Strecke aus dem Plan, sonst je Ankunftstag der besten Kombinationen
    const days = stop ? [...new Set(partial.map(x => dayOf(x.legs.at(-1)!.out.arr)))].slice(0, DAYS) : [""];
    const found = await Promise.all(days.map(async d => {
      const q = stop ? legQuery(p, from, to, addDays(d, stop.min), addDays(d, stop.max)) : legQuery(p, from, to, p.depart, p.departTo);
      try { const r = await search(q); note(r); return r.offers; }
      catch (e) { if ((e as Error).name === "AbortError") throw e; errors.push(`${from.name} → ${to.name}: ${(e as Error).message}`); return []; }
    }));
    // derselbe Flug kann in mehreren Fenstern auftauchen: nur einmal
    const byId = new Map<string, FlightOffer>();
    found.flat().forEach(o => { if (!byId.has(o.id)) byId.set(o.id, o); });
    const offers = [...byId.values()];
    const next: typeof partial = [];
    for (const x of partial) {
      const last = x.legs.at(-1);
      for (const o of offers) {
        if (last) {
          const n = nightsBetween(last.out.arr, o.out.dep);
          if (n < stop!.min || n > stop!.max || o.out.dep <= last.out.arr) continue;
        }
        next.push({ legs: [...x.legs, o], price: x.price + o.price });
      }
    }
    // gleiche Flugfolge nur einmal, günstigste zuerst
    const seen = new Set<string>();
    partial = next.sort((a, b) => a.price - b.price).filter(x => { const k2 = x.legs.map(l => l.id).join("|"); return seen.has(k2) ? false : (seen.add(k2), true); }).slice(0, KEEP);
    if (!partial.length) {
      if (!errors.length) errors.push(k ? `Keine passenden Flüge ${from.name} → ${to.name} nach ${stop!.min}–${stop!.max} Nächten` : `Keine Flüge ${from.name} → ${to.name} im Zeitraum`);
      break;
    }
  }
  const trips = partial.filter(x => x.legs.length === legs.length).slice(0, 20).map(x => ({
    id: x.legs.map(l => l.id).join("+"), legs: x.legs, price: x.price,
    nights: x.legs.slice(1).map((l, i) => nightsBetween(x.legs[i].out.arr, l.out.dep))
  }));
  return { trips, sources: [...sources.values()], errors };
}
