/*
 * Selbst eintragen (#571): Wer über den Einladungslink beitritt und eine Person übernommen hat (#435), trägt eigene
 * Angaben selbst ein, auch mit „nur ansehen“: eigene Verfügbarkeit in „Termin finden“, Wohnort der eigenen Familie und
 * einen Vorschlag zur Familie. Je Konto ein Dokument trips/{id}/self/{uid}. Angezeigt wird es eingemischt; wer bearbeiten
 * darf, übernimmt Termine und Wohnort in die Reise. Der Familienvorschlag ändert die Reise erst nach Bestätigung.
 */
import { hhKey, isActive, uid as newId, type Directory, type Trip, type Traveler } from "./model";
import { personAge } from "./people";
import { travelerOf, type Claims } from "./claims";
import type { Avail } from "./together";

export interface SelfHome { plz?: string; cc?: string; lat?: number; lon?: number; ort?: string; region?: string }
export interface FamMember { n: string; age?: number | null; kind?: "adult" | "child" | "infant" }
export interface SelfDoc {
  /** eigene Verfügbarkeit je Tag; vorhanden (auch leer): die eigene Zeile gehört dieser Person */
  a?: Record<string, Avail>;
  /** Wohnort der eigenen Familie */
  h?: SelfHome;
  /** Vorschlag: die übrigen Mitglieder der eigenen Familie (ohne einen selbst), mit Zeitpunkt (ISO) */
  f?: { m: FamMember[]; at: string };
}
export type Selfs = Record<string, SelfDoc>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const AV = new Set(["yes", "maybe", "no"]);
const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Dokument aus Firestore lesen: nur Bekanntes in erlaubter Form (die Daten stammen von anderen Mitgliedern) */
export function parseSelf(d: Record<string, unknown>): SelfDoc {
  const out: SelfDoc = {};
  if (d.a && typeof d.a === "object") {
    out.a = Object.fromEntries(Object.entries(d.a as Record<string, unknown>).filter(([k, v]) => DAY.test(k) && AV.has(v as string)).slice(0, 400)) as Record<string, Avail>;
  }
  if (d.h && typeof d.h === "object") {
    const h = d.h as Record<string, unknown>;
    const x: SelfHome = { plz: str(h.plz, 12), cc: /^[A-Z]{2}$/.test(String(h.cc)) ? String(h.cc) : undefined, lat: num(h.lat), lon: num(h.lon), ort: str(h.ort, 80), region: str(h.region, 12) };
    const clean = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as SelfHome;
    if (Object.keys(clean).length) out.h = clean;
  }
  const f = d.f as { m?: unknown; at?: unknown } | undefined;
  if (f && Array.isArray(f.m) && typeof f.at === "string") {
    const m = f.m.slice(0, 12).flatMap((x): FamMember[] => {
      const n = str((x as FamMember)?.n, 40);
      if (!n) return [];
      const age = num((x as FamMember).age);
      const kind = (x as FamMember).kind;
      return [{ n, ...(age != null && age >= 0 && age <= 120 ? { age: Math.floor(age) } : {}), ...(kind === "adult" || kind === "child" || kind === "infant" ? { kind } : {}) }];
    });
    out.f = { m, at: f.at.slice(0, 30) };
  }
  return out;
}

/** Konto → Reisende-Kennung für alle, die eine Person übernommen haben */
function owners(trip: Trip, selfs: Selfs, claims: Claims): [string, Traveler, SelfDoc][] {
  return Object.entries(selfs).flatMap(([u, s]) => { const x = travelerOf(trip, u, claims); return x ? [[u, x, s] as [string, Traveler, SelfDoc]] : []; });
}

/** Verfügbarkeit mit den selbst eingetragenen Zeilen (die eigene Angabe gewinnt) */
export function mergedAvail(trip: Trip, selfs: Selfs, claims: Claims): Record<string, Record<string, Avail>> {
  const by = { ...(trip.avail?.by || {}) };
  for (const [, x, s] of owners(trip, selfs, claims)) {
    if (!s.a) continue;
    if (Object.keys(s.a).length) by[x.id] = { ...s.a }; else delete by[x.id];
  }
  return by;
}

/** Reisende, deren Zeile jemand selbst pflegt (für andere gesperrt) */
export function selfRows(trip: Trip, selfs: Selfs, claims: Claims): Set<string> {
  return new Set(owners(trip, selfs, claims).filter(([, , s]) => !!s.a).map(([, x]) => x.id));
}

/** Wohnort einer Familie, wie ihn ein Mitglied selbst eingetragen hat */
export function selfHomeOf(trip: Trip, hh: string, selfs: Selfs, claims: Claims): SelfHome | undefined {
  return owners(trip, selfs, claims).find(([, x, s]) => hhKey(x) === hh && !!s.h?.ort)?.[2].h;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Selbst Eingetragenes in die Reise übernehmen (nur wer bearbeiten darf): Zeilen in „Termin finden“ und Wohnort der
 * Familie. true, wenn sich etwas geändert hat.
 */
export function applySelf(trip: Trip, selfs: Selfs, claims: Claims): boolean {
  let changed = false;
  for (const [, x, s] of owners(trip, selfs, claims)) {
    if (s.a && trip.avail) {
      const cur = trip.avail.by[x.id];
      if (Object.keys(s.a).length) { if (!same(cur, s.a)) { trip.avail.by[x.id] = { ...s.a }; changed = true; } }
      else if (cur) { delete trip.avail.by[x.id]; changed = true; }
    }
    if (s.h?.ort && s.h.lat != null && s.h.lon != null) {
      const k = hhKey(x);
      trip.households ||= {};
      const h = (trip.households[k] ||= { mode: "car", cars: 1 });
      const geo = { lat: s.h.lat, lon: s.h.lon, ort: s.h.ort };
      const cc = s.h.cc && s.h.cc !== "DE" ? s.h.cc : undefined;
      if (h.plz !== s.h.plz || !same(h.geo, geo) || h.cc !== cc || (s.h.region && h.region !== s.h.region)) {
        if (s.h.plz) h.plz = s.h.plz; else delete h.plz;
        h.geo = geo;
        if (cc) h.cc = cc; else delete h.cc;
        if (s.h.region) h.region = s.h.region;
        changed = true;
      }
    }
  }
  return changed;
}

/* ---------- Familienvorschlag ---------- */

const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();
export interface FamDiff { keep: { t: Traveler; m: FamMember }[]; add: FamMember[]; drop: Traveler[] }

/** Vergleich: Familie in der Reise (ohne die vorschlagende Person) gegen den Vorschlag; Zuordnung über Vorname, dann Alter */
export function famDiff(trip: Trip, me: Traveler, m: FamMember[]): FamDiff {
  const hh = hhKey(me);
  const pool = trip.travelers.filter(x => x.id !== me.id && isActive(x) && hhKey(x) === hh);
  const keep: FamDiff["keep"] = [], add: FamMember[] = [];
  for (const p of m) {
    const hits = pool.filter(x => !keep.some(k => k.t.id === x.id) && first(x.name) === first(p.n));
    hits.sort((a, b) => Math.abs((a.age ?? 99) - (p.age ?? 99)) - Math.abs((b.age ?? 99) - (p.age ?? 99)));
    if (hits[0]) keep.push({ t: hits[0], m: p }); else add.push(p);
  }
  const drop = pool.filter(x => !keep.some(k => k.t.id === x.id));
  return { keep, add, drop };
}
export const famChanges = (d: FamDiff) => d.add.length + d.drop.length + d.keep.filter(k => k.m.age != null && k.m.age !== k.t.age).length;

export interface FamProposal { uid: string; me: Traveler; at: string; diff: FamDiff }
/** offene Vorschläge (noch nicht übernommen oder abgelehnt, mit Änderungen) */
export function famProposals(trip: Trip, selfs: Selfs, claims: Claims): FamProposal[] {
  return owners(trip, selfs, claims).flatMap(([u, x, s]) => {
    if (!s.f || trip.famDone?.[u] === s.f.at) return [];
    const diff = famDiff(trip, x, s.f.m);
    return famChanges(diff) ? [{ uid: u, me: x, at: s.f.at, diff }] : [];
  });
}

/** Vorschlag übernehmen: Bleibende behalten Kennung (Alter aktualisiert), Neue kommen dazu, Entfallene sind „nicht dabei“ */
export function acceptFamily(trip: Trip, p: FamProposal) {
  for (const k of p.diff.keep) if (k.m.age != null) k.t.age = k.m.age;
  for (const m of p.diff.add) {
    trip.travelers.push({ id: newId(), name: m.n, household: p.me.household, ...(m.age != null ? { age: m.age } : {}), ...(m.kind && m.age == null ? { kind: m.kind } : {}) });
  }
  for (const x of p.diff.drop) x.active = false;
  (trip.famDone ||= {})[p.uid] = p.at;
}
/** Vorschlag ablehnen: bleibt abgelehnt, bis ein neuer kommt */
export function declineFamily(trip: Trip, p: FamProposal) { (trip.famDone ||= {})[p.uid] = p.at; }

/* ---------- Stand je Mitglied (Planer-Übersicht, „Was noch fehlt“) ---------- */

export interface MemberState { who?: Traveler; dates?: boolean; home?: boolean; polls: number }
/** Stand eines Kontos: übernommene Person, Termine eingetragen (nur mit Plan), Wohnort da, offene Abstimmungen ohne Stimme */
export function memberState(trip: Trip, u: string, selfs: Selfs, claims: Claims, votedPolls: (pollId: string) => boolean): MemberState {
  const who = travelerOf(trip, u, claims);
  if (!who) return { polls: 0 };
  const by = mergedAvail(trip, selfs, claims);
  const hh = hhKey(who);
  const home = !!(trip.households?.[hh]?.geo || selfs[u]?.h?.ort);
  const open = (trip.polls || []).filter(p => !p.closed && !(p.due && p.due < new Date().toISOString().slice(0, 10)));
  return {
    who,
    ...(trip.avail ? { dates: !!(by[who.id] && Object.keys(by[who.id]).length) } : {}),
    home,
    polls: open.filter(p => !votedPolls(p.id)).length
  };
}

/* ---------- aus dem eigenen Konto ---------- */

/** eigene Familie aus den gespeicherten Personen: gleicher Nachname wie man selbst (ohne einen selbst), Alter zum Stichtag */
export function familyFromDir(dir: Directory, day: string): FamMember[] {
  const me = dir.people.find(p => p.id === dir.me);
  const last = me?.last.trim().toLowerCase();
  if (!me || !last) return [];
  return dir.people.filter(p => p.id !== me.id && p.last.trim().toLowerCase() === last).slice(0, 12).map(p => {
    const age = personAge(p, day);
    return { n: (p.first.trim() || p.last.trim()).slice(0, 40), ...(age != null ? { age } : {}) };
  });
}
/** eigener Wohnort aus dem Konto */
export function homeFromDir(dir: Directory): SelfHome | undefined {
  const h = dir.me ? dir.people.find(p => p.id === dir.me)?.home : undefined;
  if (!h) return undefined;
  const out: SelfHome = { cc: h.cc || "DE", lat: h.lat, lon: h.lon, ort: h.ort };
  if (h.plz) out.plz = h.plz;
  return out;
}
