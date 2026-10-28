/*
 * Abstimmen und Termine für die Familie (#585), nur in geteilten Reisen:
 * - „zählt auch für“: Angaben eines Familienmitglieds mit Konto gelten für stimmberechtigte Mitglieder derselben Familie
 *   ohne eigene Angaben (automatisch, einzeln abwählbar; bei mehreren gilt das zuletzt gespeicherte Konto);
 * - „wie Anna“: wer ein Konto hat, folgt für die ganze Reise einem Familienmitglied (eigene Angaben gehen vor);
 * - nach dem Verknüpfen zählt die Familie weiter, bis die Person entschieden hat (weiter wie …, übernehmen, selbst).
 * Einstellungen im eigenen Dokument trips/{id}/self/{uid} (x, l, d).
 */
import { hhKey, type Trip, type Traveler } from "./model";
import type { Claims } from "./claims";
import { voters } from "./together";

/** Einstellungen eines Kontos: x = abgewählt (zählt nicht für), l = stimmt wie, d = entschieden (selbst) */
export interface FamCfg { x?: string[]; l?: string; d?: boolean }
export interface Acct { uid: string; cfg: FamCfg; at?: number }

/** Reisende mit Konto (über die Reise oder „Wer bist du?“) mit ihren Einstellungen */
export function accounts(trip: Trip, claims: Claims, cfgOf: (uid: string) => (FamCfg & { t?: number }) | undefined): Record<string, Acct> {
  const out: Record<string, Acct> = {};
  const byClaim = new Map(Object.entries(claims).map(([u, c]) => [c.t, u]));
  for (const x of trip.travelers) {
    const uid = x.member || byClaim.get(x.id);
    if (!uid) continue;
    const c = cfgOf(uid) || {};
    out[x.id] = { uid, cfg: { x: c.x, l: c.l, d: c.d }, at: c.t };
  }
  return out;
}

/** stimmberechtigte Familienmitglieder (ohne die Person selbst) */
export function family(trip: Trip, id: string): Traveler[] {
  const vs = voters(trip), me = vs.find(x => x.id === id) ?? trip.travelers.find(x => x.id === id);
  return me ? vs.filter(y => y.id !== id && hhKey(y) === hhKey(me)) : [];
}

/**
 * Wessen Angaben für wen gelten: Ziel → Quelle (Person mit eigenen Angaben). own: Person hat eigene Angaben;
 * at: Zeitpunkt der Angaben (bei mehreren möglichen Quellen gilt die neueste).
 */
export function stand(trip: Trip, acct: Record<string, Acct>, own: (id: string) => boolean, at: (id: string) => number = () => 0): Record<string, string> {
  const vs = voters(trip);
  function src(x: Traveler, seen: Set<string>): string | undefined {
    if (own(x.id)) return x.id;
    if (seen.has(x.id)) return undefined;
    seen.add(x.id);
    const a = acct[x.id], fam = family(trip, x.id);
    const like = a?.cfg.l ? fam.find(y => y.id === a.cfg.l) : undefined;
    if (like) return src(like, seen);
    if (a?.cfg.d) return undefined;
    // automatisch: Familienmitglied mit Konto und eigenen Angaben, das diese Person nicht abgewählt hat
    return fam.filter(y => acct[y.id] && own(y.id) && !acct[y.id].cfg.x?.includes(x.id)).sort((p, q) => at(q.id) - at(p.id))[0]?.id;
  }
  const out: Record<string, string> = {};
  for (const x of vs) {
    if (own(x.id)) continue;
    const s = src(x, new Set());
    if (s) out[x.id] = s;
  }
  return out;
}

/** nach dem Verknüpfen: noch nicht entschieden (weder „wie …“ noch selbst) */
export const undecided = (a: Acct | undefined) => !!a && !a.cfg.l && !a.cfg.d;

/** zum Abwählen („zählt auch für“): stimmberechtigte Familienmitglieder ohne Konto (mit Konto entscheiden sie selbst) */
export const forWhom = (trip: Trip, me: string, acct: Record<string, Acct>) => family(trip, me).filter(y => !acct[y.id]);

/** wem ich folgen kann: stimmberechtigte Familienmitglieder mit Konto */
export const likeable = (trip: Trip, me: string, acct: Record<string, Acct>) => family(trip, me).filter(y => !!acct[y.id]);
