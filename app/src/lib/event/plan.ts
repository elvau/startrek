/*
 * Reise zu einem Anlass (Spiel, Konzert): Zeit und Ort stehen fest, daraus werden Reisevorschläge.
 * Je Vorschlag eine Flugsuche mit festen Daten und eine Unterkunftssuche; passend ist ein Flug,
 * der rechtzeitig landet und erst nach dem Ende zurückfliegt.
 */
import { addDays } from "../flights/kiwi";
import { takeOffer, tMin } from "../flights/app";
import { takeStay } from "../stays/app";
import { money, rateOf } from "../calc";
import { t } from "../i18n/index.svelte";
import { uid, type Item, type Option, type Settings, type Trip, type TripEvent } from "../model";
import type { FlightOffer } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";

/** Landung spätestens so viele Stunden vor Beginn (Gepäck, Weg in die Stadt, Einlass) */
export const BEFORE_H = 3;
/** Rückflug frühestens so viele Stunden nach dem Ende (Weg zum Flughafen, Sicherheitskontrolle) */
export const AFTER_H = 2.5;
export const DEFAULT_H = 3;

export type VariantKind = "day" | "short" | "relaxed" | "window";

export interface Variant {
  kind: VariantKind;
  /** Hin- und Rückflugtag (JJJJ-MM-TT) */
  out: string;
  back: string;
  nights: number;
  /** Landung spätestens (Minuten seit Epoche, lokal) */
  arriveBy?: number;
  /** Rückflug frühestens */
  leaveAfter?: number;
  /** eigener Zeitraum (#265): Hin und Zurück irgendwann darin, günstigste Verbindung; out/back stehen erst nach der Suche fest */
  window?: { from: string; to: string };
}

/** Gesamtpreis eines Vorschlags: nur mit Flug, sonst keine vollständige Reise und damit kein Preis; tickets in Euro */
export function planTotal(flight: { total: number } | null, stay: { total: number } | null, tickets = 0): number | null {
  return flight ? flight.total + (stay ? Math.round(stay.total) : 0) + tickets : null;
}

type TicketPrice = NonNullable<TripEvent["price"]>;
/** Ticketpreis als Spanne („89 € – 250 €“) oder „ab 89 €“ */
export const ticketRange = (p: TicketPrice) =>
  p.max != null && p.max > p.min ? `${money(p.min, p.currency)} – ${money(p.max, p.currency)}` : t("xp.from", { p: money(p.min, p.currency) });
/** Tickets für n Personen in Euro, immer mit dem günstigsten Ticket */
export const ticketsEur = (p: TicketPrice | undefined, n: number, s: Settings) => (p?.min ? Math.round((p.min * n) / rateOf(p.currency, s)) : 0);

/**
 * Tickets als Posten in „Erlebnisse“: Preis pro Person mit dem günstigsten Ticket, die Spanne im Detail.
 * Ohne Preis als Schätzung zum Nachtragen. Gibt es den Posten schon (erneut übernommen), wird er aktualisiert.
 */
export function takeTickets(trip: Trip, ev: TripEvent): Item {
  const p = ev.price;
  const opt: Option = {
    id: uid(), label: ev.name,
    ...(p ? { detail: t("ev.tDetail", { range: ticketRange(p) }) } : {}),
    price: { mode: "person", currency: p?.currency || "EUR", adult: p?.min || 0 }, ...(p?.min ? {} : { estimate: true }),
    ...(ev.url ? { source: { name: t("evs.tickets"), at: new Date().toISOString().slice(0, 10), url: ev.url } } : {})
  };
  const name = t("ev.tItem", { name: ev.name });
  const old = ev.item ? trip.items.find(i => i.id === ev.item) : undefined;
  if (old) { old.name = name; old.options = [opt]; old.chosen = undefined; return old; }
  const item: Item = { id: uid(), cat: "attractions", name, status: "idea", options: [opt] };
  trip.items.push(item);
  ev.item = item.id;
  return item;
}

export const eventDay = (ev: TripEvent) => ev.start.slice(0, 10);
/** letzter Event-Tag: bei mehrtägigen Events (Rennwochenende, Turnier) das Ende, sonst der erste Tag */
export const eventLast = (ev: TripEvent) => (ev.end && ev.end > eventDay(ev) ? ev.end : eventDay(ev));
/** Ende am letzten Tag: gleiche Beginnzeit wie am ersten, dazu die Dauer */
export const eventEnd = (ev: TripEvent) => tMin(`${eventLast(ev)}T${ev.start.slice(11, 16) || "00:00"}`) + Math.round((ev.hours || DEFAULT_H) * 60);
/** letzter Tag beim Übernehmen eines Such-Treffers: dessen Ende, sonst der schon eingetragene, wenn er nach dem Event-Tag liegt */
export const keepEnd = (h: { end?: string }, day: string, cur: string) => (h.end && h.end > day ? h.end : cur > day ? cur : "");
/** alle Event-Tage (für Zeitleiste und Tagesplan) */
export function eventDays(ev: TripEvent): string[] {
  const out: string[] = [];
  for (let d = eventDay(ev); d <= eventLast(ev) && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Vorschläge: ohne Übernachtung (nur wenn es danach noch am selben Tag zurückgeht),
 * am selben Tag hin und am nächsten zurück, entspannt mit Anreise am Vortag.
 */
export function variants(ev: TripEvent, window?: { from: string; to: string }): Variant[] {
  const day = eventDay(ev), last = eventLast(ev);
  const arriveBy = tMin(ev.start) - BEFORE_H * 60;
  const leaveAfter = eventEnd(ev) + AFTER_H * 60;
  const span = nightsBetween(day, last);
  const list: Variant[] = [];
  if (!span && leaveAfter <= tMin(`${day}T23:00`)) list.push({ kind: "day", out: day, back: day, nights: 0, arriveBy, leaveAfter });
  list.push({ kind: "short", out: day, back: addDays(last, 1), nights: span + 1, arriveBy });
  list.push({ kind: "relaxed", out: addDays(day, -1), back: addDays(last, 1), nights: span + 2 });
  // eigener Zeitraum, der mehr erlaubt als „ab Vortag“: günstigste Verbindung darin, die das ganze Event abdeckt
  if (window && window.from <= day && window.to >= addDays(last, 1) && (window.from < addDays(day, -1) || window.to > addDays(last, 1)))
    list.push({ kind: "window", out: window.from, back: window.to, nights: span + 1, arriveBy, leaveAfter, window });
  return list;
}

const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

/** Zeitraum-Vorschlag mit gefundenem Flug: Daten und Nächte aus dem Flug */
export function fixWindow(v: Variant, o: FlightOffer): Variant {
  const out = o.out.arr.slice(0, 10), back = o.back?.dep.slice(0, 10) || v.back;
  return { ...v, out, back, nights: nightsBetween(out, back) };
}

/** Passt der Flug (hin und zurück) zum Vorschlag? */
export function fits(o: FlightOffer, v: Variant): boolean {
  if (!o.back) return false;
  if (v.window) {
    // im Zeitraum: Abflug frühestens am ersten Tag, Rückflug spätestens am letzten, Event ganz dabei
    if (o.out.dep.slice(0, 10) < v.window.from || o.back.dep.slice(0, 10) > v.window.to) return false;
    return (v.arriveBy == null || tMin(o.out.arr) <= v.arriveBy) && (v.leaveAfter == null || tMin(o.back.dep) >= v.leaveAfter);
  }
  if (o.out.dep.slice(0, 10) !== v.out || o.back.dep.slice(0, 10) !== v.back) return false;
  if (v.arriveBy != null && tMin(o.out.arr) > v.arriveBy) return false;
  if (v.leaveAfter != null && tMin(o.back.dep) < v.leaveAfter) return false;
  return true;
}

/** Unterkunft: günstigste gut bewertete (ab 8 von 10), sonst die günstigste */
export function pickStay(offers: StayOffer[]): StayOffer | null {
  if (!offers.length) return null;
  const cheap = (l: StayOffer[]) => l.reduce((a, b) => (b.total < a.total ? b : a));
  const good = offers.filter(o => (o.score ?? 0) >= 8);
  return cheap(good.length ? good : offers);
}

/** Entfernung in km (Luftlinie) */
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
/** in der Nähe des Veranstaltungsorts: bis zu dieser Entfernung bevorzugt */
export const NEAR_KM = 5;

/** Unterkunft am nächsten am Veranstaltungsort (nur mit bekannter Lage) */
export function nearestStay(offers: StayOffer[], at?: { lat?: number; lon?: number }): { offer: StayOffer; km: number } | null {
  if (at?.lat == null || at.lon == null) return null;
  const p = { lat: at.lat, lon: at.lon };
  let best: { offer: StayOffer; km: number } | null = null;
  for (const o of offers) {
    if (o.lat == null || o.lon == null) continue;
    const d = km(p, { lat: o.lat, lon: o.lon });
    if (!best || d < best.km) best = { offer: o, km: d };
  }
  return best;
}

/** Unterkunft wie pickStay, aber wenn der Veranstaltungsort bekannt ist, zuerst unter denen in der Nähe */
export function pickStayNear(offers: StayOffer[], at?: { lat?: number; lon?: number }): StayOffer | null {
  if (at?.lat == null || at.lon == null) return pickStay(offers);
  const p = { lat: at.lat, lon: at.lon };
  const near = offers.filter(o => o.lat != null && o.lon != null && km(p, { lat: o.lat, lon: o.lon }) <= NEAR_KM);
  return pickStay(near.length ? near : offers);
}

/**
 * Der Reisename folgt dem Anlass, solange man keinen eigenen vergeben hat (#379): beim ersten Mal (autoName nicht
 * false) und wenn der Name noch der des zuvor gewählten Anlasses ist. Ändert man ihn selbst, bleibt er.
 */
export function followEventName(trip: Trip, prev: string | undefined, next: string) {
  if (trip.autoName !== false || (prev && trip.name === prev)) { trip.name = next; trip.autoName = false; }
}

/** Vorschlag übernehmen: Reisedaten setzen, Flug, Unterkunft und Tickets als Posten anlegen */
export function takePlan(trip: Trip, v: Variant, flight: FlightOffer | null, stay: StayOffer | null, q: StayQuery | null, ids?: string[]) {
  trip.from = v.out;
  trip.to = v.back;
  trip.detail ||= {};
  if (flight) { trip.detail.flights = true; takeOffer(trip, flight, undefined, ids); }
  if (stay && q && v.nights) { trip.detail.stay = true; takeStay(trip, stay, { ...q, checkin: v.out, checkout: v.back }); }
  if (trip.event) { trip.detail.attractions = true; takeTickets(trip, trip.event); }
}
