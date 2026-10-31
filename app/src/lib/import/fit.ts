/*
 * Abgleich mit der Reise (#616): Passt ein Angebot, das in eine bestehende Reise soll, zu Zeitraum, Land und Personenzahl?
 * Nur echte Abweichungen zählen: fehlt eine Angabe im Angebot oder in der Reise, ist das keine Abweichung.
 * Geladen wird trotzdem; die Hinweise bleiben am Posten („bitte prüfen“), bis jemand „Geprüft“ antippt.
 */
import { isActive, type Trip } from "../model";
import type { ImportedOffer } from "./ai";

export type FitKind = "dates" | "country" | "people";
export interface FitIssue { k: FitKind; offer: string; trip: string }

const DAY = 86400000;
const ms = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z");
const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);

/** Zeitraum laut Angebot: angegeben, sonst aus Nächten bzw. den Flügen */
export function offerRange(o: ImportedOffer): { from?: string; to?: string } {
  const days = [...(o.flights?.legs || []).map(l => l.dep), ...(o.cruise?.ports || []).map(p => p.date)].filter((d): d is string => !!d).map(d => d.slice(0, 10)).sort();
  const from = o.from || days[0];
  const to = o.to || (from && o.nights ? addDays(from, o.nights) : undefined) || (days.length > 1 ? days.at(-1) : undefined);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** Personen laut Angebot (Erwachsene und Kinder); unbekannt: undefined */
export function offerPeople(o: ImportedOffer): number | undefined {
  if (o.travelers?.length) return o.travelers.length;
  const kids = o.childAges?.length || o.children || 0;
  return o.adults ? o.adults + kids : kids || undefined;
}

/** Reise kennt ihre Reisenden (mehr als der Platzhalter vom Start) */
const knowsPeople = (trip: Trip) => trip.travelers.length > 1 || trip.travelers.some(p => !p.placeholder);

/**
 * Abweichungen zwischen Angebot und Reise. who: nur diese Personen (z. B. Mitreisende des Postens), sonst alle, die dabei sind.
 * Ein Tag Spielraum beim Zeitraum (Nachtflug, Anreise am Vorabend).
 */
export function fitOf(trip: Trip, o: ImportedOffer, who?: string[]): FitIssue[] {
  const out: FitIssue[] = [];
  const r = offerRange(o);
  if (trip.from && trip.to && (r.from || r.to)) {
    const lo = ms(trip.from) - DAY, hi = ms(trip.to) + DAY;
    const off = (r.from && (ms(r.from) < lo || ms(r.from) > hi)) || (r.to && (ms(r.to) > hi || ms(r.to) < lo));
    if (off) out.push({ k: "dates", offer: [r.from, r.to].filter(Boolean).join("|"), trip: `${trip.from}|${trip.to}` });
  }
  const cc = (trip.country || "").toUpperCase();
  if (o.country && /^[A-Z]{2}$/.test(cc) && o.country !== cc) out.push({ k: "country", offer: o.country, trip: cc });
  const n = offerPeople(o);
  if (n && knowsPeople(trip)) {
    const m = who?.length ? who.length : trip.travelers.filter(isActive).length;
    if (m && n !== m) out.push({ k: "people", offer: String(n), trip: String(m) });
  }
  return out;
}

