/*
 * Gleiche Zeilen zusammenfassen: bei Gruppenreisen zahlen viele Familien (fast) dasselbe und schlafen in denselben Nächten.
 * Statt 15 gleicher Zeilen eine Zeile „Alle (15)“ bzw. „Anna, Ben +3“.
 */
import { t } from "./i18n/index.svelte";
import type { HouseholdShare } from "./calc";

/** fast gleich: höchstens 5 € oder 3 % Unterschied */
export const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, 0.03 * Math.max(Math.abs(a), Math.abs(b)));

/** in Gruppen teilen, Reihenfolge bleibt (Gruppe nach ihrem ersten Mitglied) */
export function cluster<T>(xs: T[], same: (a: T, b: T) => boolean): T[][] {
  const out: T[][] = [];
  for (const x of xs) {
    const g = out.find(g => same(g[0], x));
    if (g) g.push(x); else out.push([x]);
  }
  return out;
}

/** Name einer Gruppe: alle → „Alle (15)“, sonst bis zu zwei Namen und „+n“ */
export function groupLabel(names: string[], total: number): string {
  if (names.length > 1 && names.length === total) return t("grp.all", { n: names.length });
  return names.length <= 2 ? names.join(", ") : t("grp.more", { names: names.slice(0, 2).join(", "), n: names.length - 2 });
}

/** je Person, damit alle Reisenden wie eine Gruppe zählen (Familie mit 2 Personen zahlt doppelt so viel) */
export const pp = (h: HouseholdShare) => h.total / Math.max(1, h.members.length);
/** Familien, die je Person (fast) gleich viel zahlen */
export const sameShare = (a: HouseholdShare, b: HouseholdShare) => near(pp(a), pp(b));
export interface ShareGroup { key: string; shares: HouseholdShare[]; exact: boolean }
export function shareGroups(shares: HouseholdShare[]): ShareGroup[] {
  return cluster(shares, sameShare).map(g => ({ key: g[0].name, shares: g, exact: g.every(h => Math.round(pp(h)) === Math.round(pp(g[0]))) }));
}
export const persons = (g: ShareGroup) => g.shares.reduce((a, h) => a + h.members.length, 0);
/** Betrag je Person in der Gruppe (je Bereich oder gesamt) */
export const perPerson = (g: ShareGroup, f: (h: HouseholdShare) => number) => g.shares.reduce((a, h) => a + f(h), 0) / Math.max(1, persons(g));
