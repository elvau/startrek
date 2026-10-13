/*
 * Konto einrichten (#160): Führerschein als Stufe ↔ ungefähres Jahr, Hinweise für den Mietwagen aus Führerschein und
 * Kreditkarte, Entwurf des Assistenten aus dem Konto lesen und wieder hineinschreiben. Ohne Svelte-Zustand, gut testbar.
 */
import type { Directory, Item, Person, Prefs, TravelDoc, Traveler, Trip } from "../model";
import { isActive, uid } from "../model";
import { personAge } from "../people";
import type { LicenseBucket, SetupAi } from "./ai";

const yearOf = (now: Date) => now.getFullYear();

/** gespeichertes Jahr zur Stufe (0: kein Führerschein) */
export function licenseYear(b: LicenseBucket, now = new Date()): number {
  const y = yearOf(now);
  return b === "none" ? 0 : b === "lt1" ? y : b === "gt1" ? y - 1 : b === "gt2" ? y - 2 : y - 5;
}

/** Stufe aus dem gespeicherten Jahr; wächst mit der Zeit mit (2024 als „unter 1 Jahr“ ist 2026 „über 2 Jahre“) */
export function licenseBucket(year: number | undefined, now = new Date()): LicenseBucket | undefined {
  if (year == null || !isFinite(year)) return undefined;
  if (year === 0) return "none";
  const n = yearOf(now) - year;
  return n < 1 ? "lt1" : n < 2 ? "gt1" : n < 5 ? "gt2" : "gt5";
}

/** Mietwagen: die meisten Vermieter verlangen den Führerschein seit mindestens 1 Jahr */
export const LICENSE_MIN_YEARS = 1;

/**
 * Hinweise am Mietwagen aus den gespeicherten Personen: wer keinen oder einen zu neuen Führerschein hat, und ob laut
 * Konto niemand eine Kreditkarte hat (nur wenn es für alle Erwachsenen mit Angabe bekannt ist).
 */
export function rentalPeople(it: Item, trip: Trip, people: Person[], now = new Date()): { none: Traveler[]; fresh: Traveler[]; noCard: boolean } {
  const ids = it.participants?.length ? new Set(it.participants) : null;
  const adult = trip.settings?.adultAge ?? 18;
  const rows = trip.travelers.filter(t => isActive(t) && (!ids || ids.has(t.id)) && t.personId && (t.age == null || Number(t.age) >= adult))
    .map(t => ({ t, p: people.find(p => p.id === t.personId) })).filter((r): r is { t: Traveler; p: Person } => !!r.p);
  const none = rows.filter(r => licenseBucket(r.p.license, now) === "none").map(r => r.t);
  const fresh = rows.filter(r => r.p.license && yearOf(now) - r.p.license < LICENSE_MIN_YEARS).map(r => r.t);
  const known = rows.filter(r => r.p.creditCard != null);
  return { none, fresh, noCard: known.length > 0 && known.length === rows.length && known.every(r => r.p.creditCard === false) };
}

/* ---------- Entwurf des Assistenten ---------- */

export interface Companion { id?: string; first: string; age?: number | null; on: boolean }

export interface SetupDraft {
  first: string;
  last: string;
  birth: string;
  age: number | null;
  plz: string;
  /** Wohnort zur PLZ (löst die Oberfläche auf) */
  home?: Person["home"];
  /** sensibel: nur mit Konto, in travelDocs */
  gender: "" | "f" | "m" | "x";
  nats: string[];
  lgbtq: boolean;
  license: LicenseBucket | "";
  creditCard: boolean | null;
  rail: string[];
  /** Mitreisende (gespeicherte Personen und neue), Gruppe */
  companions: Companion[];
  group: string;
  prefs: Prefs;
}

/** Entwurf aus dem, was schon im Konto steht (nichts geht verloren, wenn man nur durchklickt) */
export function draftFrom(d: Directory, doc: TravelDoc | undefined, now = new Date()): SetupDraft {
  const me = d.me ? d.people.find(p => p.id === d.me) : undefined;
  const fam = me ? d.groups.filter(g => g.memberIds.includes(me.id)).sort((a, b) => b.memberIds.length - a.memberIds.length)[0] : undefined;
  return {
    first: me?.first || "", last: me?.last || "", birth: me?.birth || "", age: me?.age ?? null, plz: d.prefs?.plz || me?.home?.plz || "", home: me?.home,
    gender: doc?.gender || "", nats: (doc?.nats || "").split(",").filter(x => /^[A-Z]{2}$/.test(x)), lgbtq: doc?.lgbtq === "1",
    license: licenseBucket(me?.license, now) || "", creditCard: me?.creditCard ?? null, rail: me?.rail || [],
    companions: d.people.filter(p => p.id !== me?.id).map(p => ({ id: p.id, first: p.first, age: personAge(p), on: !!fam?.memberIds.includes(p.id) })),
    group: fam?.name || "",
    prefs: structuredClone(d.prefs || {})
  };
}

const set = <T extends object, K extends keyof T>(o: T, k: K, v: T[K] | undefined | null | "") => {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) delete o[k]; else o[k] = v;
};

/** Vorschlag der KI in den Entwurf übernehmen: nur leere Felder füllen, Eingaben bleiben */
export function applyAi(d: SetupDraft, a: SetupAi): string[] {
  const filled: string[] = [];
  const fill = <K extends keyof Prefs>(k: K, v: Prefs[K] | undefined) => { if (v !== undefined && d.prefs[k] == null) { d.prefs[k] = v; filled.push(k); } };
  if (a.license && !d.license) { d.license = a.license; filled.push("license"); }
  if (a.creditCard != null && d.creditCard == null) { d.creditCard = a.creditCard; filled.push("creditCard"); }
  if (a.rail && !d.rail.length) { d.rail = a.rail; filled.push("rail"); }
  fill("car", a.car); fill("styles", a.styles); fill("budget", a.budget); fill("stayType", a.stayType); fill("minStars", a.minStars);
  fill("board", a.board); fill("airports", a.airports); fill("maxStops", a.maxStops); fill("bags", a.bags); fill("maxHours", a.maxHours);
  fill("holidays", a.holidays); fill("months", a.months); fill("nightsMin", a.nightsMin); fill("nightsMax", a.nightsMax);
  fill("pet", a.pet); fill("stepFree", a.stepFree); fill("diet", a.diet);
  // Mitreisende ohne Namen: Platzhalter, die man im Schritt „Mitreisende“ benennt (nur wenn noch keine da sind)
  if (!d.companions.some(c => c.on) && (a.adults || a.childAges?.length)) {
    const n = Math.max(0, (a.adults || 1) - 1);
    for (let i = 0; i < n; i++) d.companions.push({ first: "", age: null, on: true });
    for (const age of a.childAges || []) d.companions.push({ first: "", age, on: true });
    if (n || a.childAges?.length) filled.push("companions");
  }
  return filled;
}

/** Entwurf ins Konto schreiben (Personenverzeichnis, Vorlieben); sensible Angaben gibt es getrennt zurück */
/** companions: IDs der Mitreisenden in der Reihenfolge des Entwurfs (neu angelegte bekommen hier ihre ID) */
export function applyDraft(dir: Directory, d: SetupDraft, now = new Date()): { meId: string; companions: (string | undefined)[]; doc: Pick<TravelDoc, "gender" | "nats" | "lgbtq"> } {
  let me = dir.me ? dir.people.find(p => p.id === dir.me) : undefined;
  if (!me && (d.first.trim() || d.birth || d.age)) {
    me = { id: uid(), first: d.first.trim(), last: d.last.trim() };
    dir.people.push(me);
    dir.me = me.id;
  }
  if (me) {
    if (d.first.trim()) me.first = d.first.trim();
    me.last = d.last.trim();
    set(me, "birth", d.birth || undefined);
    set(me, "age", d.birth ? undefined : d.age);
    set(me, "license", d.license ? licenseYear(d.license, now) : undefined);
    set(me, "creditCard", d.creditCard);
    set(me, "rail", d.rail);
    if (d.home) me.home = d.home;
  }
  // Mitreisende: neue anlegen (Nachname wie „Ich“ = gleiche Familie), Gruppe mit allen Ausgewählten
  const ids: string[] = me ? [me.id] : [];
  for (const c of d.companions) {
    if (!c.on) continue;
    let p = c.id ? dir.people.find(x => x.id === c.id) : undefined;
    if (!p) {
      if (!c.first.trim()) continue;
      p = { id: uid(), first: c.first.trim(), last: d.last.trim(), ...(c.age != null ? { age: c.age } : {}) };
      dir.people.push(p);
      c.id = p.id;
    }
    ids.push(p.id);
  }
  if (d.group.trim() && ids.length > 1) {
    const g = dir.groups.find(x => x.name === d.group.trim());
    if (g) g.memberIds = [...new Set(ids)];
    else dir.groups.push({ id: uid(), name: d.group.trim(), memberIds: ids });
  }
  const prefs: Prefs = { ...d.prefs };
  for (const k of Object.keys(prefs) as (keyof Prefs)[]) set(prefs, k, prefs[k]);
  if (d.plz) prefs.plz = d.plz; else delete prefs.plz;
  if (d.plz && d.home?.cc && d.home.cc !== "DE") prefs.plzCc = d.home.cc; else delete prefs.plzCc;
  dir.prefs = prefs;
  dir.setup = now.toISOString().slice(0, 10);
  return { meId: me?.id || "", companions: d.companions.map(c => c.id), doc: { gender: d.gender || undefined, nats: d.nats.join(",") || undefined, lgbtq: d.lgbtq ? "1" : undefined } };
}

/** von selbst nur mit Konto, einmal je Konto (#330): erst ausprobieren, eingerichtet wird mit dem Konto; „Später“ zählt als eingerichtet */
export const shouldAutoStart = (d: Directory, loggedIn: boolean) => loggedIn && !d.setup;
