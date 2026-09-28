/*
 * Rundreise aus einzelnen Flügen: DUS → Rio (5–8 Nächte) → Buenos Aires (4–6 Nächte) → DUS.
 * Jede Strecke wird als Hinflug mit Zeitfenster gesucht, Stufe für Stufe: die Ankunftstage der günstigsten
 * bisherigen Kombinationen bestimmen das Fenster der nächsten Strecke (Nächte vor Ort von–bis).
 * Getrennte Tickets: jeder Flug wird einzeln gebucht.
 * Kurze Stationen (höchstens eine Nacht) gehen auch als Gabelflug: ein Ticket mit langem Umstieg dort (via).
 */
import { t } from "../i18n/index.svelte";
import { addDays } from "./kiwi";
import type { FlightOffer, FlightQuery, SearchResult, SourceStatus } from "./types";

/** ein Ort als Liste von Codes (ein Flughafen, alle einer Stadt oder im Umkreis) */
export interface RoundPlace { name: string; code: string; airports: string[]; cityCode?: string }
export interface RoundStop {
  place: RoundPlace;
  min: number;
  max: number;
  /** als langer Umstieg auf einem Ticket statt eigener Flüge (nur kurze Aufenthalte) */
  via?: boolean;
}

/** höchstens so viele Nächte: Station kann auch Umstieg sein (unter 48 Stunden) */
export const SHORT_NIGHTS = 1;
export const isShort = (s: RoundStop) => s.max <= SHORT_NIGHTS;
/** Aufenthalt beim Umstieg in Stunden aus den Nächten: 0 Nächte 4–24 h, 1 Nacht 10–48 h */
export const viaHours = (s: RoundStop): [number, number] => [s.min === 0 ? 4 : 10, Math.min(48, (s.max + 1) * 24)];

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
  /** Nächte an jeder Station mit eigenen Flügen */
  nights: number[];
  /** jede Station in Reihenfolge: Nächte (eigene Flüge) oder Stunden (Umstieg auf einem Ticket) */
  stays: { name: string; nights?: number; hours?: number }[];
}

/** eine Strecke der Suche; after: Station davor (Nächte von–bis), via: Station als Umstieg */
export interface RoundLeg { from: RoundPlace; to: RoundPlace; after?: RoundStop; via?: RoundStop }

export interface RoundResult { trips: RoundTrip[]; sources: SourceStatus[]; errors: string[] }

/** Strecken der Reise: Start → Station 1 → … → (Start); eine Umstiegs-Station steckt in der Strecke darüber hinweg */
export function roundLegs(p: RoundPlan): RoundLeg[] {
  const targets: (RoundStop & { home?: boolean })[] = [...p.stops, ...(p.home ? [{ place: p.from, min: 0, max: 0, home: true }] : [])];
  const out: RoundLeg[] = [];
  let from = p.from, after: RoundStop | undefined, via: RoundStop | undefined;
  for (const [i, t] of targets.entries()) {
    const last = i === targets.length - 1;
    // höchstens ein Umstieg je Strecke; die letzte Station ist immer ein Ziel
    if (t.via && !via && !last) { via = t; continue; }
    out.push({ from, to: t.place, ...(after ? { after } : {}), ...(via ? { via } : {}) });
    from = t.place; after = t.home ? undefined : t; via = undefined;
  }
  return out;
}

const dayOf = (iso: string) => iso.slice(0, 10);
export const nightsBetween = (arr: string, dep: string) => Math.round((Date.parse(dayOf(dep)) - Date.parse(dayOf(arr))) / 86400000);

/** Anfrage für eine Strecke: Hinflug im Zeitfenster, Orte als Code-Listen */
export function legQuery(p: RoundPlan, from: RoundPlace, to: RoundPlace, depart: string, departTo: string, via?: RoundStop): FlightQuery {
  return {
    ...(via ? { via: via.place.airports, viaHours: viaHours(via) } : {}),
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

  for (const [k, { from, to, after, via }] of legs.entries()) {
    progress?.(k + 1, legs.length);
    const stop = after ?? null;
    // Zeitfenster: erste Strecke aus dem Plan, sonst je Ankunftstag der besten Kombinationen
    const days = stop ? [...new Set(partial.map(x => dayOf(x.legs.at(-1)!.out.arr)))].slice(0, DAYS) : [""];
    const found = await Promise.all(days.map(async d => {
      const q = stop ? legQuery(p, from, to, addDays(d, stop.min), addDays(d, stop.max), via) : legQuery(p, from, to, p.depart, p.departTo, via);
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
      if (!errors.length) errors.push(k ? t("round.noneAfter", { a: from.name, b: to.name, min: stop!.min, max: stop!.max }) : t("round.none", { a: from.name, b: to.name }));
      break;
    }
  }
  const trips = partial.filter(x => x.legs.length === legs.length).slice(0, 20).map(x => {
    const nights = x.legs.slice(1).map((l, i) => nightsBetween(x.legs[i].out.arr, l.out.dep));
    // Stationen in Reihenfolge: Umstieg (Stunden aus dem Flug) vor dem Ziel der Strecke, dann das Ziel mit Nächten
    const stays: RoundTrip["stays"] = [];
    legs.forEach((lg, i) => {
      if (lg.via) stays.push({ name: lg.via.place.name, hours: x.legs[i].out.layovers?.find(l => lg.via!.place.airports.includes(l.at))?.hours });
      if (i < nights.length) stays.push({ name: lg.to.name, nights: nights[i] });
    });
    return { id: x.legs.map(l => l.id).join("+"), legs: x.legs, price: x.price, nights, stays };
  });
  return { trips, sources: [...sources.values()], errors };
}
