/*
 * „✕ Ohne mich“ (#439): was es bedeutet, wenn Personen bei einer Möglichkeit nicht mitkommen. Rechnet auf einer Kopie
 * der Reise (Möglichkeit übernommen, Personen „nicht dabei“) mit der üblichen Logik; die Reise bleibt unverändert.
 * Je Posten aus der Preisart: pro Person fällt weg, pro Einheit bleibt und verteilt sich auf weniger Leute,
 * mit mehreren Einheiten (Zimmer, Autos) ggf. eine weniger.
 */
import type { Item, Trip } from "./model";
import { isActive } from "./model";
import { activeOption, totals, type Totals } from "./calc";
import { syncFood } from "./food";
import type { GeoData } from "./geo/places";
import { VETO, type Poll, type VetoWhy } from "./together";

export interface Without {
  /** Personen, die wegfallen (nur aktive Reisende) */
  ids: string[];
  before: { total: number; people: number; perPerson: number };
  after: { total: number; people: number; perPerson: number };
  /** Posten pro Person: fallen für sie weg */
  dropped: string[];
  /** Posten pro Einheit: Preis bleibt, verteilt sich auf weniger Leute (kleiner möglich?) */
  stays: { name: string; net: number }[];
  /** mehrere Einheiten: weniger nötig (z. B. ein Zimmer weniger) */
  fewer: { name: string; before: number; after: number }[];
}

const okD = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Möglichkeit einer Abstimmung auf eine Kopie der Reise anwenden (Termin bzw. Angebot), ohne sie abzuschließen */
export function applyOption(tr: Trip, p: Poll, optionId: string) {
  const o = p.options.find(x => x.id === optionId);
  if (!o) return;
  if (p.kind === "dates" && okD(o.from) && okD(o.to)) { tr.from = o.from; tr.to = o.to; }
  if (p.kind === "offers" && o.itemId && o.optionId) {
    const it = tr.items.find(i => i.id === o.itemId);
    if (it && it.options.some(x => x.id === o.optionId)) it.chosen = o.optionId;
  }
}

const name = (it: Item, tr: Trip) => it.name || activeOption(it, tr)?.label || "";

/** Folgen, wenn diese Personen nicht dabei sind; prep wendet vorher z. B. die Möglichkeit an */
export function without(trip: Trip, ids: string[], prep?: (tr: Trip) => void, g?: GeoData): Without {
  const run = (out: string[]): [Trip, Totals] => {
    const tr: Trip = JSON.parse(JSON.stringify(trip));
    prep?.(tr);
    for (const x of tr.travelers) if (out.includes(x.id)) x.active = false;
    if (g?.world.length) syncFood(tr, g);
    return [tr, totals(tr)];
  };
  const gone = ids.filter(id => trip.travelers.some(x => x.id === id && isActive(x)));
  const [tb, A] = run([]), [, B] = run(gone);
  const pp = (T: Totals) => ({ total: T.total, people: T.active, perPerson: T.active ? T.total / T.active : 0 });
  const dropped: string[] = [], stays: Without["stays"] = [], fewer: Without["fewer"] = [];
  for (const it of tb.items) {
    const a = A.items[it.id], b = B.items[it.id];
    if (!a?.counts || !(a.net > 0) || !gone.some(id => (a.per[id] || 0) > 0)) continue;
    const o = activeOption(it, tb);
    if (o?.price.mode !== "unit") dropped.push(name(it, tb));
    else if (b && b.units < a.units) fewer.push({ name: name(it, tb), before: a.units, after: b.units });
    else stays.push({ name: name(it, tb), net: b?.net ?? a.net });
  }
  return { ids: gone, before: pp(A), after: pp(B), dropped, stays, fewer };
}

/** wer bei einer Möglichkeit wegfällt: je „Ohne mich“ die Person, mit Familie alle aktiven ihres Haushalts */
export function vetoedIds(trip: Trip, votes: Record<string, Record<string, number>>, option: string, why: Record<string, Record<string, VetoWhy>> = {}): string[] {
  const out = new Set<string>();
  for (const [who, m] of Object.entries(votes)) {
    if (m[option] !== VETO) continue;
    const t = trip.travelers.find(x => x.id === who);
    if (!t) continue;
    out.add(t.id);
    if (why[who]?.[option]?.f) for (const x of trip.travelers) if (x.household === t.household && isActive(x)) out.add(x.id);
  }
  return [...out];
}

/** Personen der eigenen Familie (aktiv, ohne einen selbst) */
export const familyOf = (trip: Trip, me: string) => {
  const t = trip.travelers.find(x => x.id === me);
  return t ? trip.travelers.filter(x => x.id !== me && x.household === t.household && isActive(x)) : [];
};

/** Info an alle, die schon abgestimmt haben (#439): wer bei einer Möglichkeit neu nicht dabei bzw. doch wieder dabei ist */
export interface VetoNote { option: string; label: string; gone: string[]; back: string[]; before: number; after: number }

/**
 * Änderungen gegenüber dem zuletzt Gesehenen je Möglichkeit: Preis pro Person vorher (ohne die zuletzt gesehenen)
 * und jetzt (ohne die aktuellen); nur, wenn sich jemand geändert hat
 */
export function vetoNotes(trip: Trip, p: Poll, now: Record<string, string[]>, seen: Record<string, string[]>, g?: GeoData): VetoNote[] {
  const out: VetoNote[] = [];
  const nm = (id: string) => trip.travelers.find(x => x.id === id)?.name || "?";
  for (const o of p.options) {
    const cur = now[o.id] || [], old = seen[o.id] || [];
    const gone = cur.filter(x => !old.includes(x)), back = old.filter(x => !cur.includes(x));
    if (!gone.length && !back.length) continue;
    const prep = (tr: Trip) => applyOption(tr, p, o.id);
    const before = without(trip, old, prep, g).after.perPerson, after = without(trip, cur, prep, g).after.perPerson;
    out.push({ option: o.id, label: o.label, gone: gone.map(nm), back: back.map(nm), before, after });
  }
  return out;
}
