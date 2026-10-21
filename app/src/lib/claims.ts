/*
 * „Wer bist du?“ (#435): Wer über den Einladungslink beitritt, übernimmt einen Platzhalter oder eine noch nicht
 * verknüpfte erwachsene Person. Die Zuordnung liegt im Dokument der Reise (claims: Konto → Reisende-Kennung und
 * Vorname), weil auch „nur ansehen“ sie setzen darf; wer bearbeiten darf, trägt sie in die Reise ein
 * (Reisende.member, Platzhalter bekommt den Vornamen).
 */
import { AGE, isActive, type Trip, type Traveler } from "./model";

export interface Claim { t: string; n: string }
export type Claims = Record<string, Claim>;

const adult = (trip: Trip, x: Traveler) => (x.age != null ? x.age >= (trip.settings.adultAge ?? AGE.adult) : x.kind !== "child" && x.kind !== "infant");

/** wählbar: aktive Erwachsene, die noch niemandem gehören (weder in der Reise noch in den Zuordnungen) */
export function claimable(trip: Trip, claims: Claims = {}, me?: string): Traveler[] {
  const taken = new Set(Object.entries(claims).filter(([u]) => u !== me).map(([, c]) => c.t));
  return trip.travelers.filter(x => isActive(x) && adult(trip, x) && !taken.has(x.id) && (!x.member || x.member === me));
}

/** Vorname aus der Eingabe: gekürzt, ohne Steuerzeichen */
export const cleanName = (s: string) => s.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);

/**
 * Zuordnungen in die Reise übernehmen (nur wer bearbeiten darf): Reisende.member setzen, Platzhalter umbenennen,
 * Zuordnungen, die es nicht mehr gibt, lösen. true, wenn sich etwas geändert hat.
 */
export function applyClaims(trip: Trip, claims: Claims = {}): boolean {
  let changed = false;
  const byTraveler = new Map(Object.entries(claims).map(([u, c]) => [c.t, { u, n: c.n }]));
  for (const x of trip.travelers) {
    const c = byTraveler.get(x.id);
    if (c) {
      if (x.member !== c.u) { x.member = c.u; changed = true; }
      const n = cleanName(c.n);
      if (x.placeholder && n && x.name !== n) { x.name = n; x.placeholder = false; changed = true; }
    } else if (x.member) {
      delete x.member;
      changed = true;
    }
  }
  return changed;
}

/** Reisende, die ein Konto ist (für Abstimmung und „Ohne mich“) */
export const travelerOf = (trip: Trip, uid: string, claims: Claims = {}): Traveler | undefined =>
  trip.travelers.find(x => x.member === uid) ?? trip.travelers.find(x => x.id === claims[uid]?.t);
