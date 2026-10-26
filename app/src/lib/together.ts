/*
 * Gemeinsam planen (#173): Termin finden (#174) und Abstimmen (#175).
 * Verfügbarkeit je Person und Tag (kann, vielleicht, kann nicht) in der Reise; daraus die besten Zeiträume für die
 * gewünschte Zahl an Nächten. Abstimmungen über Termine, Angebote eines Postens oder frei, je Person 👍, egal, 👎.
 * Alles liegt in der Reise (trip.avail, trip.polls), wie die übrigen Reisedaten; Personen sind Kennungen der Reisenden.
 */
import { AGE, isActive, uid, type Trip } from "./model";
import type { DaysCfg } from "./datefit";

export type Avail = "yes" | "maybe" | "no";
export interface AvailPlan extends DaysCfg {
  /** Zeitraum, in dem gesucht wird (JJJJ-MM-TT) */
  from: string;
  to: string;
  /** gewünschte Nächte */
  nights: number;
  /** je Person (Reisende-Kennung) und Tag */
  by: Record<string, Record<string, Avail>>;
}

export interface Period {
  from: string;
  to: string;
  /** kann = 1, vielleicht = ½ */
  score: number;
  yes: string[];
  maybe: string[];
  no: string[];
  /** noch nichts eingetragen */
  open: string[];
}

export type Vote = 1 | 0 | -1;
export interface PollOption {
  id: string;
  label: string;
  /** Termin */
  from?: string;
  to?: string;
  /** Angebot eines Postens */
  itemId?: string;
  optionId?: string;
  /** Variante eines Vergleichs (#432): Kennung der Reise */
  tripId?: string;
}
/**
 * Art der Abstimmung (#432): eine Stimme, mehrere Stimmen oder Meilen-Wahl (Meilen frei verteilen, auch alle auf eine
 * Möglichkeit); fehlt: wie bisher 👍 / egal / 👎. In allen neuen Arten zählt -1 als „✕ Ohne mich“ (hartes Veto, #439).
 */
export type PollMode = "one" | "multi" | "miles";
export interface VetoWhy { r?: string; f?: boolean }
export interface Poll {
  id: string;
  q: string;
  /** variants: über die Varianten eines Vergleichs, liegt in einer der Varianten (#432) */
  kind: "dates" | "offers" | "free" | "variants";
  options: PollOption[];
  mode?: PollMode;
  /** Meilen je Person (Meilen-Wahl), höchstens Möglichkeiten × 5 */
  miles?: number;
  /** Frist (JJJJ-MM-TT, einschließlich); danach wird nicht mehr abgestimmt */
  due?: string;
  /** je Person (Reisende-Kennung): Stimme je Möglichkeit (bisher 1/0/-1; Meilen-Wahl: Anzahl Meilen; -1: ohne mich) */
  votes: Record<string, Record<string, number>>;
  /** zu „Ohne mich“ (#439), je Person und Möglichkeit: Grund (freiwillig), mit der ganzen Familie */
  why?: Record<string, Record<string, VetoWhy>>;
  /** abgeschlossen (ISO) und gewählte Möglichkeit */
  closed?: string;
  result?: string;
}

const DAY = 86400000;
const toT = (d: string) => Date.parse(d + "T12:00:00Z");
export const addDay = (d: string, n: number) => new Date(toT(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toT(b) - toT(a)) / DAY);
const okD = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** aktive Reisende ab dem Erwachsenenalter (Kinder entscheiden die Eltern) */
export const grownUps = (trip: Trip) => trip.travelers.filter(x => isActive(x) && (x.age == null || x.age >= (trip.settings.adultAge ?? AGE.adult)) && x.kind !== "child" && x.kind !== "infant");
/**
 * wer abstimmt und Zeiten einträgt: die Erwachsenen, die mitentscheiden (#567, z. B. nur der Kegelclub, nicht die
 * Begleitung); ohne Auswahl bzw. wenn davon niemand mehr dabei ist: alle Erwachsenen
 */
export const voters = (trip: Trip) => {
  const all = grownUps(trip);
  if (!trip.deciders?.length) return all;
  const d = new Set(trip.deciders);
  const v = all.filter(x => d.has(x.id));
  return v.length ? v : all;
};
/** Erwachsene, die nicht mitentscheiden (Begleitung) */
export const notDeciding = (trip: Trip) => { const v = new Set(voters(trip).map(x => x.id)); return grownUps(trip).filter(x => !v.has(x.id)); };

export interface Circle { key: string; ids: string[] }
/** Schnellwahl: je Herkunftsgruppe die Erwachsenen; wer aus keiner Gruppe kommt, unter „others“ (nur wenn es Gruppen gibt) */
export function circles(trip: Trip): Circle[] {
  const all = grownUps(trip), out: Circle[] = [];
  for (const x of all) if (x.group) { const c = out.find(c => c.key === x.group); if (c) c.ids.push(x.id); else out.push({ key: x.group, ids: [x.id] }); }
  const rest = all.filter(x => !x.group).map(x => x.id);
  if (out.length && rest.length) out.push({ key: "", ids: rest });
  return out;
}
/** Auswahl setzen: alle Erwachsenen (bzw. leer) heißt keine Einschränkung */
export function setDeciders(trip: Trip, ids: string[]) {
  const all = grownUps(trip).map(x => x.id);
  const keep = [...new Set(ids)].filter(id => all.includes(id));
  if (!keep.length || keep.length === all.length) delete trip.deciders; else trip.deciders = keep;
}

/** antippen: offen → kann → vielleicht → kann nicht → offen */
export function cycle(a?: Avail): Avail | undefined {
  return a === undefined ? "yes" : a === "yes" ? "maybe" : a === "maybe" ? "no" : undefined;
}

export function setAvail(trip: Trip, person: string, day: string, a: Avail | undefined) {
  const p = trip.avail;
  if (!p) return;
  // über den Zustand lesen, nicht das frisch angelegte Objekt (sonst sieht die Oberfläche die Änderung nicht)
  if (!p.by[person]) p.by[person] = {};
  const m = p.by[person];
  if (a) m[day] = a; else delete m[day];
  if (!Object.keys(m).length) delete p.by[person];
}

/** Zeitraum prüfen: Bis vor Von („order“) oder Reise länger als der Zeitraum („nights“); "" = in Ordnung oder noch leer */
export function planError(from: string, to: string, nights: number): "" | "order" | "nights" {
  if (!okD(from) || !okD(to)) return "";
  if (to < from) return "order";
  return nights > daysBetween(from, to) ? "nights" : "";
}

/** Tage des Planungszeitraums: höchstens 120, mit „Wochenenden“ (#568) ein Jahr (das Raster zeigt dann nur passende Tage) */
export function planDays(p: Pick<AvailPlan, "from" | "to" | "days">): string[] {
  if (!okD(p.from) || !okD(p.to) || p.to < p.from) return [];
  const n = Math.min(daysBetween(p.from, p.to), p.days === "weekend" ? 365 : 119);
  return Array.from({ length: n + 1 }, (_, i) => addDay(p.from, i));
}

/** eine Person in einem Zeitraum (An- bis Abreisetag): kann nicht, wenn ein Tag „kann nicht“ ist; offen, wenn ein Tag ohne Eintrag ist;
 *  sonst vielleicht bei einem „vielleicht“, kann nur, wenn alle Tage „kann“ sind */
function personIn(m: Record<string, Avail> | undefined, from: string, to: string): Avail | "open" {
  if (!m || !Object.keys(m).length) return "open";
  let maybe = false, unset = false;
  for (let d = from; d <= to; d = addDay(d, 1)) {
    if (m[d] === "no") return "no";
    if (m[d] === "maybe") maybe = true;
    else if (m[d] !== "yes") unset = true;
  }
  return unset ? "open" : maybe ? "maybe" : "yes";
}

/** beste Zeiträume mit der gewünschten Zahl an Nächten, ohne Überschneidung, beste zuerst; ok: nur passende (#568) */
export function bestPeriods(trip: Trip, max = 3, ok?: (from: string, to: string) => boolean): Period[] {
  const p = trip.avail;
  if (!p || !(p.nights > 0)) return [];
  const people = voters(trip).map(x => x.id);
  if (!people.some(id => p.by[id] && Object.keys(p.by[id]).length)) return [];
  const all: Period[] = [];
  for (const from of planDays(p)) {
    const to = addDay(from, p.nights);
    if (to > p.to) break;
    if (ok && !ok(from, to)) continue;
    const r: Period = { from, to, score: 0, yes: [], maybe: [], no: [], open: [] };
    for (const id of people) {
      const s = personIn(p.by[id], from, to);
      r[s === "open" ? "open" : s].push(id);
    }
    r.score = r.yes.length + r.maybe.length / 2;
    all.push(r);
  }
  all.sort((a, b) => b.score - a.score || a.no.length - b.no.length || a.from.localeCompare(b.from));
  const out: Period[] = [];
  for (const r of all) {
    if (out.length >= max) break;
    if (r.score <= 0) break;
    if (out.some(o => r.from < o.to && o.from < r.to)) continue;
    out.push(r);
  }
  return out;
}

/** Tage, an denen jemand (aus ids, sonst alle) nicht kann: für Suche und KI-Planer */
export function blockedDays(trip: Trip, ids?: string[]): Set<string> {
  const out = new Set<string>();
  for (const [id, m] of Object.entries(trip.avail?.by || {})) {
    if (ids && !ids.includes(id)) continue;
    for (const [d, a] of Object.entries(m)) if (a === "no") out.add(d);
  }
  return out;
}
/** liegt ein Zeitraum (Hinflug- bis Rückflugtag) auf einem gesperrten Tag? */
export function hitsBlocked(blocked: Set<string>, from: string, to: string): boolean {
  if (!blocked.size || !okD(from) || !okD(to)) return false;
  for (let d = from; d <= to; d = addDay(d, 1)) if (blocked.has(d)) return true;
  return false;
}

/* ---------- Abstimmen ---------- */

/** Abstimmung an die Reise hängen (über den Zustand, damit die Oberfläche sie gleich zeigt) */
export function addPoll(trip: Trip, p: Poll) {
  if (!trip.polls) trip.polls = [];
  trip.polls.push(p);
}

export function newPoll(q: string, kind: Poll["kind"], options: Omit<PollOption, "id">[], mode: PollMode = "one"): Poll {
  return { id: uid(), q: q.trim().slice(0, 200), kind, mode, options: options.slice(0, 8).map(o => ({ ...o, id: uid(), label: o.label.trim().slice(0, 120) })), votes: {} };
}

export function vote(p: Poll, person: string, option: string, v: Vote | undefined) {
  if (p.closed) return;
  if (!p.votes[person]) p.votes[person] = {};
  const m = p.votes[person];
  if (v === undefined) delete m[option]; else m[option] = v;
  if (!Object.keys(m).length) delete p.votes[person];
}

/** nur Stimmen aktueller Stimmberechtigter zählen (Entfernte, „nicht dabei“ und Kinder nicht); Stimmen aus dem Konto („u:…“) bleiben */
export function eligibleVotes<V>(trip: Trip | undefined, votes: Record<string, V>): Record<string, V> {
  if (!trip) return votes;
  const ok = new Set(voters(trip).map(x => x.id));
  return Object.fromEntries(Object.entries(votes).filter(([k]) => ok.has(k) || k.startsWith("u:")));
}

export interface Tally { id: string; label: string; score: number; up: number; meh: number; down: number }
/** Auszählung: 👍 +1, egal 0, 👎 −1; bei Gleichstand weniger 👎 vorn, dann die Reihenfolge */
export function tally(p: Poll, trip?: Trip): Tally[] {
  const all = Object.values(eligibleVotes(trip, p.votes));
  const rows = p.options.map(o => {
    const vs = all.map(m => m[o.id]).filter(v => v !== undefined);
    return { id: o.id, label: o.label, up: vs.filter(v => v === 1).length, meh: vs.filter(v => v === 0).length, down: vs.filter(v => v === -1).length, score: 0 };
  });
  for (const r of rows) r.score = r.up - r.down;
  return rows.sort((a, b) => b.score - a.score || a.down - b.down || p.options.findIndex(o => o.id === a.id) - p.options.findIndex(o => o.id === b.id));
}

/** wer noch nicht abgestimmt hat */
export const missing = (trip: Trip, p: Poll, remote?: Record<string, Record<string, number>>) => {
  const v = mergedVotes(p, remote);
  return voters(trip).filter(x => !v[x.id] || !Object.keys(v[x.id]).length);
};

/** Ergebnis übernehmen: Termin als Reisedatum, Angebot als gewählt; die Abstimmung ist danach abgeschlossen */
export function applyResult(trip: Trip, p: Poll, optionId: string) {
  const o = p.options.find(x => x.id === optionId);
  if (!o) return;
  if (p.kind === "dates" && okD(o.from) && okD(o.to)) { trip.from = o.from; trip.to = o.to; }
  if (p.kind === "offers" && o.itemId && o.optionId) {
    const it = trip.items.find(i => i.id === o.itemId);
    if (it && it.options.some(x => x.id === o.optionId)) { it.chosen = o.optionId; if (it.status === "idea") it.status = "chosen"; }
  }
  p.closed = new Date().toISOString();
  p.result = optionId;
}

/** offene bzw. letzte Abstimmung über die Varianten eines Vergleichs in dieser Reise (#432) */
export const variantPoll = (trip: Pick<Trip, "polls" | "cmp">) => {
  const ps = (trip.polls || []).filter(p => p.kind === "variants" && trip.cmp && p.options.some(o => o.tripId));
  return ps.find(p => !p.closed) ?? ps.at(-1);
};

/** Stand je Variante: wie viele dafür, wer „ohne mich“, und wie viele überhaupt abgestimmt haben */
export function variantStand(p: Poll, votes: Record<string, Record<string, number>> = p.votes, trip?: Trip): { byTrip: Record<string, { for: number; veto: number }>; voted: number } {
  votes = eligibleVotes(trip, votes);
  const rows = tallyMode(p, votes);
  const byTrip: Record<string, { for: number; veto: number }> = {};
  for (const o of p.options) if (o.tripId) { const r = rows.find(x => x.id === o.id); byTrip[o.tripId] = { for: r?.people || 0, veto: r?.veto.length || 0 }; }
  return { byTrip, voted: Object.values(votes).filter(m => Object.keys(m).length).length };
}

export const openPolls = (trip: Trip) => (trip.polls || []).filter(p => !p.closed);

/* ---------- Arten der Abstimmung (#432) ---------- */

export const VETO = -1;
/** Meilen-Wahl: höchstens Möglichkeiten × 5 je Person, Vorgabe 10 */
export const maxMiles = (p: Poll) => p.options.length * 5;
export const milesOf = (p: Poll) => Math.max(1, Math.min(maxMiles(p), Math.round(p.miles ?? 10)));

/** noch offen: nicht abgeschlossen und Frist (einschließlich) nicht vorbei */
export const pollOpen = (p: Poll, today = new Date().toISOString().slice(0, 10)) => !p.closed && (!p.due || today <= p.due);
/** Frist endet heute oder morgen */
export const dueSoon = (p: Poll, today = new Date().toISOString().slice(0, 10)) => !!p.due && pollOpen(p, today) && p.due <= addDay(today, 1);

/** Stimmen einer Person in einer neuen Art ändern; gibt die neue Stimme (je Möglichkeit) zurück, ohne zu speichern */
export function nextVote(p: Poll, mine: Record<string, number> | undefined, option: string, act: "for" | "veto" | "more" | "less"): Record<string, number> {
  const m = { ...(mine || {}) };
  const pos = (k: string) => (m[k] || 0) > 0;
  if (act === "veto") {
    if (m[option] === VETO) delete m[option]; else m[option] = VETO;
  } else if (act === "for") {
    if (pos(option)) delete m[option];
    else {
      if (p.mode === "one") for (const k of Object.keys(m)) if (pos(k)) delete m[k];
      m[option] = 1;
    }
  } else {
    const used = Object.values(m).filter(v => v > 0).reduce((a, b) => a + b, 0);
    const cur = Math.max(0, m[option] || 0);
    if (act === "more" && used < milesOf(p)) m[option] = cur + 1;
    if (act === "less" && cur > 0) { if (cur === 1) delete m[option]; else m[option] = cur - 1; }
  }
  return m;
}

/** übrige Meilen einer Person */
export const milesLeft = (p: Poll, mine?: Record<string, number>) => milesOf(p) - Object.values(mine || {}).filter(v => v > 0).reduce((a, b) => a + b, 0);

export interface ModeTally { id: string; label: string; score: number; people: number; veto: string[] }
/**
 * Auszählung der neuen Arten: Stimmen bzw. Meilen je Möglichkeit, wie viele Personen dafür sind, wer „ohne mich“ sagt.
 * Meilen-Wahl: wer mehr verteilt hat als erlaubt (z. B. nachträglich gesenkt), zählt anteilig. Beste zuerst, bei
 * Gleichstand weniger „ohne mich“, dann die Reihenfolge.
 */
export function tallyMode(p: Poll, votes: Record<string, Record<string, number>> = p.votes, trip?: Trip): ModeTally[] {
  const rows = p.options.map(o => ({ id: o.id, label: o.label, score: 0, people: 0, veto: [] as string[] }));
  for (const [who, m] of Object.entries(eligibleVotes(trip, votes))) {
    const sum = Object.values(m).filter(v => v > 0).reduce((a, b) => a + b, 0);
    const f = p.mode === "miles" && sum > milesOf(p) ? milesOf(p) / sum : 1;
    for (const r of rows) {
      const v = m[r.id];
      if (v === VETO) r.veto.push(who);
      else if (v > 0) { r.score += p.mode === "miles" ? v * f : 1; r.people++; }
    }
  }
  const order = (id: string) => p.options.findIndex(o => o.id === id);
  return rows.sort((a, b) => b.score - a.score || a.veto.length - b.veto.length || order(a.id) - order(b.id));
}

/** Stimmen der Reise und aus dem Konto (geteilte Reise: je Person ein eigenes Dokument) zusammen; das Konto geht vor */
export const mergedVotes = (p: Poll, remote?: Record<string, Record<string, number>>) => ({ ...p.votes, ...(remote || {}) });
