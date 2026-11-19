/*
 * Gespeicherte Personen in Reisen: Alter zum Reisebeginn aus dem Geburtsdatum, Wohnort der Familie für Anfahrt
 * und Flughafensuche. Überschreibt nur, was aus der Person kommt; eigene Angaben in der Reise bleiben.
 */
import { hhKey, type Person, type Trip } from "./model";
import { today as localToday } from "./today";

/** Alter an einem Tag (JJJJ-MM-TT) aus dem Geburtsdatum */
export function ageAt(birth: string, day: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth), d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!b || !d) return null;
  let age = +d[1] - +b[1];
  if (+d[2] < +b[2] || (+d[2] === +b[2] && +d[3] < +b[3])) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Alter einer Person an einem Tag: aus dem Geburtsdatum, sonst das eingetragene Alter */
export function personAge(p: Person, day = localToday()): number | null {
  return (p.birth ? ageAt(p.birth, day) : null) ?? p.age ?? null;
}

/* ---------- Familie einer gespeicherten Person (#578) ---------- */

const homeId = (p: Person) => (p.home?.ort ? `${p.home.cc || "DE"}|${p.home.ort.trim().toLowerCase()}` : "");
const lastOf = (p: Person) => (p.last || "").trim();

/**
 * Familie einer gespeicherten Person: der Nachname. Wohnen Personen mit demselben Nachnamen an verschiedenen Orten, sind es
 * verschiedene Familien („Klein (Kempen)“, „Klein (Wuppertal)“); wer ohne Wohnort gespeichert ist, gehört zur Familie mit
 * dem bloßen Nachnamen. Reisen speichern den Schlüssel (Traveler.household), ältere Reisen behalten ihren Nachnamen.
 */
export function familyKey(p: Person, all: Person[]): string {
  const last = lastOf(p);
  if (!last) return "";
  const homes = new Set(all.filter(x => lastOf(x).toLowerCase() === last.toLowerCase()).map(homeId).filter(Boolean));
  return homes.size > 1 && p.home?.ort ? `${last} (${p.home.ort.trim()})` : last;
}

/** gehört die Person zu dieser Familie (Schlüssel aus familyKey oder, bei älteren Reisen, nur der Nachname)? */
export const inFamily = (p: Person, key: string, all: Person[]): boolean => {
  const k = key.trim().toLowerCase();
  return !!k && (familyKey(p, all).toLowerCase() === k || lastOf(p).toLowerCase() === k);
};

/** Nachname zu einem Familienschlüssel („Klein (Kempen)“ mit Wohnort Kempen → „Klein“; sonst unverändert) */
export const lastOfKey = (key: string, ort?: string): string => {
  const m = /^(.*\S)\s+\(([^)]+)\)$/.exec(key.trim());
  return m && ort && m[2].trim().toLowerCase() === ort.trim().toLowerCase() ? m[1] : key.trim();
};

/** Stichtag für das Alter: Reisebeginn, sonst heute */
const refDay = (trip: Trip, today: string) => (trip.from && /^\d{4}-\d{2}-\d{2}$/.test(trip.from) ? trip.from : today);

/**
 * Angaben der Personen in die Reise übernehmen: Alter aus dem Geburtsdatum (zum Reisebeginn), Wohnort für die Familie,
 * falls sie noch keinen hat. Gibt zurück, ob sich etwas geändert hat (nur dann schreiben, sonst Endlosschleife).
 */
export function applyPeople(trip: Trip, people: Person[], today = localToday()): boolean {
  let changed = false;
  const day = refDay(trip, today);
  for (const t of trip.travelers) {
    const p = t.personId ? people.find(x => x.id === t.personId) : undefined;
    if (!p) continue;
    if (p.birth) {
      const age = ageAt(p.birth, day);
      if (age != null && t.age !== age) { t.age = age; t.kind = undefined; changed = true; }
    }
    if (p.home) {
      const hh = hhKey(t);
      trip.households ||= {};
      const h = trip.households[hh] || {};
      if (!h.geo && !h.plz) {
        trip.households[hh] = { ...h, plz: p.home.plz, geo: { lat: p.home.lat, lon: p.home.lon, ort: p.home.ort } };
        changed = true;
      }
    }
  }
  return changed;
}
