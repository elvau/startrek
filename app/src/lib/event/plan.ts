/*
 * Reise zu einem Anlass (Spiel, Konzert): Zeit und Ort stehen fest, daraus werden Reisevorschläge.
 * Je Vorschlag eine Flugsuche mit festen Daten und eine Unterkunftssuche; passend ist ein Flug,
 * der rechtzeitig landet und erst nach dem Ende zurückfliegt.
 */
import { addDays } from "../flights/kiwi";
import { takeOffer, tMin } from "../flights/app";
import { takeStay } from "../stays/app";
import type { Trip, TripEvent } from "../model";
import type { FlightOffer } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";

/** Landung spätestens so viele Stunden vor Beginn (Gepäck, Weg in die Stadt, Einlass) */
export const BEFORE_H = 3;
/** Rückflug frühestens so viele Stunden nach dem Ende (Weg zum Flughafen, Sicherheitskontrolle) */
export const AFTER_H = 2.5;
export const DEFAULT_H = 3;

export type VariantKind = "day" | "short" | "relaxed";

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
}

export const eventDay = (ev: TripEvent) => ev.start.slice(0, 10);
export const eventEnd = (ev: TripEvent) => tMin(ev.start) + Math.round((ev.hours || DEFAULT_H) * 60);

/**
 * Vorschläge: ohne Übernachtung (nur wenn es danach noch am selben Tag zurückgeht),
 * am selben Tag hin und am nächsten zurück, entspannt mit Anreise am Vortag.
 */
export function variants(ev: TripEvent): Variant[] {
  const day = eventDay(ev);
  const arriveBy = tMin(ev.start) - BEFORE_H * 60;
  const leaveAfter = eventEnd(ev) + AFTER_H * 60;
  const list: Variant[] = [];
  if (leaveAfter <= tMin(`${day}T23:00`)) list.push({ kind: "day", out: day, back: day, nights: 0, arriveBy, leaveAfter });
  list.push({ kind: "short", out: day, back: addDays(day, 1), nights: 1, arriveBy });
  list.push({ kind: "relaxed", out: addDays(day, -1), back: addDays(day, 1), nights: 2 });
  return list;
}

/** Passt der Flug (hin und zurück) zum Vorschlag? */
export function fits(o: FlightOffer, v: Variant): boolean {
  if (!o.back || o.out.dep.slice(0, 10) !== v.out || o.back.dep.slice(0, 10) !== v.back) return false;
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

/** Unterkunft wie pickStay, aber wenn der Veranstaltungsort bekannt ist, zuerst unter denen in der Nähe */
export function pickStayNear(offers: StayOffer[], at?: { lat?: number; lon?: number }): StayOffer | null {
  if (at?.lat == null || at.lon == null) return pickStay(offers);
  const p = { lat: at.lat, lon: at.lon };
  const near = offers.filter(o => o.lat != null && o.lon != null && km(p, { lat: o.lat, lon: o.lon }) <= NEAR_KM);
  return pickStay(near.length ? near : offers);
}

/** Vorschlag übernehmen: Reisedaten setzen, Flug und Unterkunft als Posten anlegen */
export function takePlan(trip: Trip, v: Variant, flight: FlightOffer | null, stay: StayOffer | null, q: StayQuery | null, ids?: string[]) {
  trip.from = v.out;
  trip.to = v.back;
  trip.detail ||= {};
  if (flight) { trip.detail.flights = true; takeOffer(trip, flight, undefined, ids); }
  if (stay && q && v.nights) { trip.detail.stay = true; takeStay(trip, stay, { ...q, checkin: v.out, checkout: v.back }); }
}
