/*
 * Katalogeintrag als neue Reise übernehmen (#647): Posten aus dem Reisekern (Richtwerte pro Person), Anreise je Startort:
 * Familien ab ihrem Wohnort, die übrigen ab dem Startort des Betrachters wie im Katalog geschätzt, Touren nach Wahl (alle mit Tagesplan, nur
 * Touren, einzelne, keine) als Idee an ihrem Tag. Verpflegung und Transport vor Ort rechnet die App selbst (versteckte
 * Kosten), sie kommen nicht doppelt. Echte Preise sucht man danach im Posten.
 */
import { addDays, okDate } from "../calc/travel";
import { hhKey, isActive, uid, type DayPlan, type Item, type Option, type Traveler } from "../model";
import { arrivalFor, type ArrivalOpts, type LatLon } from "./arrival";
import type { CatalogCost, CatalogEntry } from "./types";

/** im Flug-Richtwert enthaltener Weg zum Flughafen pro Person (hin und zurück): die App rechnet ihn je Familie selbst */
export const ACCESS_PP = 30;
const FOOD = /essen|verpflegung|mittagessen|food|meal|hütten/i;

export type TourMode = "all" | "tours" | "pick" | "none";
export interface Start extends LatLon { name: string }

export interface TakeOpts extends ArrivalOpts {
  travelers: Traveler[];
  /** Wohnort je Familie (Schlüssel wie hhKey) */
  homes?: Record<string, Start | undefined>;
  /** Rückfall für Familien ohne Wohnort: Startort des Betrachters */
  origin?: Start | null;
  /** Reisebeginn (JJJJ-MM-TT), optional */
  from?: string;
  tours: TourMode;
  /** bei „pick“: Namen der gewählten Touren */
  picked?: string[];
  /** Texte (i18n), damit die Logik ohne Oberfläche testbar bleibt */
  tx: (k: TakeText, v?: Record<string, string | number>) => string;
}
export type TakeText = "flight" | "ground" | "preNight" | "detail" | "stay" | "flights" | "local" | "core" | "other";

/**
 * Lage der Posten relativ zum Reisebeginn (#652): Unterkunft ab Nacht off für n Nächte, Tour an Tag day. Damit lassen sich
 * Daten nachtragen, wenn der Reisebeginn erst später feststeht; place: Ort für die Suche nach echten Preisen.
 */
export interface TakenRel { nights: number; /** erster Ort mit Lage (Ziel der Flugsuche) */ dest?: { place: string; lat: number; lon: number; cc?: string }; stays: Record<string, { off: number; n: number; place: string }>; /** Startort je Flugposten */ flights?: Record<string, Start>; tours: Record<string, { day?: number; time?: string; place: string }> }
export interface Taken { items: Item[]; days: Record<string, DayPlan>; to?: string; rel: TakenRel }

const est = (pp: number, detail: string): Option => ({ id: uid(), label: "", estimate: true, detail, price: { mode: "person", currency: "EUR", adult: Math.max(0, Math.round(pp)) } });

/** Kostenzeile ohne Verpflegung und Transport vor Ort (die rechnet die App selbst) */
export const keepCost = (c: CatalogCost) => c.auto !== "food" && c.auto !== "local" && !(c.cat === "misc" && FOOD.test(c.label || ""));

export function takeEntry(e: CatalogEntry, o: TakeOpts): Taken {
  const detail = o.tx("detail", { m: e.stand });
  const items: Item[] = [];
  const from = o.from && okDate(o.from) ? o.from : undefined;
  const month = from ? +from.slice(5, 7) : undefined;
  const act = o.travelers.filter(isActive);

  const s0 = e.stops[0];
  const rel: TakenRel = { nights: e.nights, ...(s0 && s0.lat != null && s0.lon != null ? { dest: { place: s0.place, lat: s0.lat, lon: s0.lon, ...(s0.cc ? { cc: s0.cc } : {}) } } : {}), stays: {}, tours: {} };

  // Anreise je Startort: Familien mit Wohnort ab dort, alle übrigen ab dem Startort des Betrachters; gleicher Startort = ein Posten
  const starts = new Map<string, { home: Start; ids: string[] }>();
  for (const x of act) {
    const home = o.homes?.[hhKey(x)] || o.origin;
    if (!home) continue;
    const k = `${home.name}|${home.lat.toFixed(2)}|${home.lon.toFixed(2)}`;
    const cur = starts.get(k) || { home, ids: [] };
    cur.ids.push(x.id);
    starts.set(k, cur);
  }
  for (const { home, ids } of starts.values()) {
    const a = arrivalFor(e, home, month, o);
    if (!a) continue;
    if (a.mode === "flight") {
      const id = uid();
      items.push({ id, cat: "flights", name: o.tx("flight", { from: home.name }), status: "idea", participants: [...ids],
        options: [est(a.pp - (a.preNight || 0) - ACCESS_PP, detail)] });
      (rel.flights ??= {})[id] = { name: home.name, lat: home.lat, lon: home.lon };
      if (a.preNight) {
        const night = from ? addDays(from, -1) : undefined;
        items.push({ id: uid(), cat: "stay", name: o.tx("preNight", { place: e.stops[0]?.place || "" }), status: "idea", participants: [...ids],
          ...(night && from ? { from: night, to: from } : {}), options: [est(a.preNight, detail)] });
      }
    } else {
      items.push({ id: uid(), cat: "transport", name: o.tx("ground", { from: home.name }), status: "idea", participants: [...ids], arrival: true,
        options: [est(a.pp, detail)] });
    }
  }

  // Unterkünfte je Station mit Zeitraum (relativ: ab Nacht off), Daten nur, wenn der Reisebeginn feststeht
  const stopOff = new Map<string, { off: number; n: number }>();
  let off = 0;
  for (const s of e.stops) { if (s.nights > 0 && !stopOff.has(s.place)) stopOff.set(s.place, { off, n: s.nights }); off += s.nights; }
  const stopFrom = new Map<string, { a: string; b: string }>();
  if (from) for (const [p, r] of stopOff) stopFrom.set(p, { a: addDays(from, r.off), b: addDays(from, r.off + r.n) });
  const first = e.stops[0]?.place || "";
  for (const c of e.costs.filter(keepCost)) {
    const key = c.cat === "stay" ? "stay" : c.cat === "flights" ? "flights" : c.cat === "transport" ? "local" : c.cat === "attractions" ? "core" : "other";
    const name = c.label || [o.tx(key), c.place].filter(Boolean).join(" – ");
    const span = c.cat === "stay" ? (c.place && stopFrom.get(c.place)) || (from && e.stops.length === 1 ? { a: from, b: addDays(from, e.nights) } : undefined) : undefined;
    const id = uid();
    items.push({ id, cat: c.cat, name, status: "idea", ...(span ? { from: span.a, to: span.b } : {}), options: [est(c.pp, detail)] });
    if (c.cat === "stay") {
      const r = (c.place && stopOff.get(c.place)) || (e.stops.length === 1 ? { off: 0, n: e.nights } : undefined);
      if (r) rel.stays[id] = { ...r, place: c.place || first };
    }
  }

  // Touren nach Wahl, als Idee an ihrem Tag
  const tours = o.tours === "none" ? [] : o.tours === "pick" ? e.tours.filter(x => o.picked?.includes(x.name)) : e.tours;
  for (const x of tours) {
    const day = from && x.day ? addDays(from, x.day - 1) + (x.time ? `T${x.time}` : "") : undefined;
    const id = uid();
    items.push({ id, cat: "attractions", name: x.name, status: "idea", ...(day ? { day } : {}), options: [est(x.pp || 0, detail)] });
    rel.tours[id] = { ...(x.day ? { day: x.day } : {}), ...(x.time ? { time: x.time } : {}), place: placeOnDay(e, x.day) };
  }

  // Tagesplan nur bei „alle Touren mit Tagesplan“ und mit Reisebeginn
  const days: Record<string, DayPlan> = {};
  if (o.tours === "all" && from) {
    for (const d of e.days) {
      days[addDays(from, d.n - 1)] = { ...(d.title ? { title: d.title } : {}), notes: d.notes.map(n => ({ id: uid(), text: n.text, ...(n.kind ? { kind: n.kind } : {}), ...(n.time ? { time: n.time } : {}) })) };
    }
  }
  return { items, days, ...(from ? { to: addDays(from, e.nights) } : {}), rel };
}

/** Ort am Tag day (1 = erster Tag): Station, in der man in dieser Nacht ist; ohne Tag der erste Ort */
export function placeOnDay(e: CatalogEntry, day?: number): string {
  if (!day) return e.stops[0]?.place || "";
  let n = 0;
  for (const s of e.stops) { n += s.nights; if (day <= n) return s.place; }
  return e.stops[e.stops.length - 1]?.place || "";
}
