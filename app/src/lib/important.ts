/*
 * Wichtiges zur Reise: was man vor der Reise unbedingt bedenken muss, als Punkte mit Zähler (Epic „Wichtiges zur Reise“).
 * Quellen: Warnstufen des Auswärtigen Amts (advice.ts), Einreise je Pass (visa.ts) und Hinweise (hints.ts).
 * „Erledigt“ bzw. „gelesen“ steht in der Reise (trip.done), je Person: Einreise für alle, die etwas tun müssen,
 * Warnungen und Hinweise für alle Reisenden. Ändert sich der Inhalt eines Punkts (Signatur), gilt er wieder als offen;
 * kommen Personen dazu, ebenso.
 */
import type { Trip } from "./model";
import { isActive } from "./model";
import { adviceLevel, type Advice, type AdviceMap } from "./advice";
import { entryFor, needsAction, type EntryKind, type VisaData } from "./visa";
import type { Hint } from "./hints";

export type PointKind = "aa" | "warn" | "entry" | "place";

export interface PointPerson { id: string; name: string; nat: string; kind?: EntryKind; days?: number }

export interface Point {
  /** stabil je Reise: aa:US, entry:US, hint:machu */
  key: string;
  kind: PointKind;
  /** kleiner = wichtiger */
  prio: number;
  /** Inhalt; ändert er sich, ist der Punkt wieder offen */
  sig: string;
  cc?: string;
  /** Warnstufe des Auswärtigen Amts */
  level?: "warning" | "partial" | "situation";
  advice?: Advice;
  /** passender Hinweis aus hints.ts (Text, Links, Gebühr) */
  hint?: Hint;
  /** je Person: wer etwas tun muss (Einreise) bzw. wer lesen soll (alle Reisenden) */
  persons?: PointPerson[];
}

/** erledigt je Punkt: Signatur beim Abhaken, bei Punkten für Personen die erledigten Personen */
export type DoneMap = Record<string, { sig: string; ids?: string[] }>;

const PRIO = { warning: 0, warn: 0, partial: 1, entry: 2, situation: 3, place: 4 } as const;

export interface PointInput {
  trip: Trip;
  /** Reiseländer (ISO-2) */
  countries: string[];
  /** Hinweise für die Reise (hintsFor) */
  hints: Hint[];
  visa: VisaData | null;
  advice: AdviceMap;
}

/** alle wichtigen Punkte der Reise, wichtigste zuerst */
export function importantPoints({ trip, countries, hints, visa, advice }: PointInput): Point[] {
  const act = trip.travelers.filter(isActive);
  const all: PointPerson[] | undefined = act.length ? act.map(p => ({ id: p.id, name: p.name, nat: p.nat || "DE" })) : undefined;
  const out: Point[] = [];
  for (const cc of countries) {
    const a = advice[cc], level = adviceLevel(a);
    if (a && level) out.push({ key: `aa:${cc}`, kind: "aa", prio: PRIO[level], sig: `${level}|${a.modified || ""}`, cc, level, advice: a, ...(all ? { persons: all } : {}) });
    // Einreise: wer vorab etwas tun muss (Passport Index) bzw. für wen der Hinweis gilt (deutsche Staatsangehörige)
    const hint = hints.find(h => h.kind === "entry" && h.cc?.includes(cc));
    const persons: PointPerson[] = [];
    for (const p of act) {
      const nat = p.nat || "DE", e = visa ? entryFor(visa, nat, cc) : { kind: "unknown" as EntryKind };
      if (e.kind === "home") continue;
      if (needsAction(e) || (hint && nat === "DE")) persons.push({ id: p.id, name: p.name, nat, kind: e.kind, ...(e.days != null ? { days: e.days } : {}) });
    }
    if (persons.length) out.push({ key: `entry:${cc}`, kind: "entry", prio: PRIO.entry, sig: [...new Set(persons.map(p => `${p.nat}:${p.kind}`))].sort().join(","), cc, ...(hint ? { hint } : {}), persons });
  }
  for (const h of hints) {
    if (h.kind === "entry") continue;
    out.push({ key: `hint:${h.id}`, kind: h.kind === "warn" ? "warn" : "place", prio: PRIO[h.kind === "warn" ? "warn" : "place"], sig: h.id, ...(h.cc?.[0] ? { cc: h.cc[0] } : {}), hint: h, ...(all ? { persons: all } : {}) });
  }
  return out.sort((a, b) => a.prio - b.prio);
}

/** erledigte Personen eines Punkts (nur, solange die Signatur gilt) */
export function doneIds(p: Point, done: DoneMap = {}): string[] {
  const d = done[p.key];
  if (!d || d.sig !== p.sig) return [];
  return p.persons ? (d.ids || []).filter(id => p.persons!.some(x => x.id === id)) : [];
}

/** offen: nie abgehakt, Inhalt geändert oder noch nicht alle Personen erledigt */
export function isOpen(p: Point, done: DoneMap = {}): boolean {
  const d = done[p.key];
  if (!d || d.sig !== p.sig) return true;
  return !!p.persons && p.persons.some(x => !(d.ids || []).includes(x.id));
}

/** aufgeklappt zeigen (Reisewarnung, Teilreisewarnung, Einreise), sonst einzeilig bis zum Antippen */
export const isUrgent = (p: Point) => p.kind === "entry" || p.kind === "warn" || p.level === "warning" || p.level === "partial";

export const openCount = (ps: Point[], done?: DoneMap) => ps.filter(p => isOpen(p, done)).length;

/** abhaken: ganzer Punkt bzw. eine Person; done wird verändert */
export function markDone(done: DoneMap, p: Point, personId?: string) {
  if (!p.persons) { done[p.key] = { sig: p.sig }; return; }
  const ids = new Set(doneIds(p, done));
  for (const id of personId ? [personId] : p.persons.map(x => x.id)) ids.add(id);
  done[p.key] = { sig: p.sig, ids: [...ids] };
}

/** wieder öffnen: ganzer Punkt bzw. eine Person */
export function reopen(done: DoneMap, p: Point, personId?: string) {
  if (!personId || !p.persons) { delete done[p.key]; return; }
  const ids = doneIds(p, done).filter(id => id !== personId);
  if (ids.length) done[p.key] = { sig: p.sig, ids }; else delete done[p.key];
}
