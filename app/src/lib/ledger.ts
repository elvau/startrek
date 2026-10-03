/*
 * Kasse: wer hat was bezahlt? Zahlungen zu Posten (Payment.by), Ausgaben unterwegs (Trip.expenses) und Ausgleichszahlungen
 * (Trip.transfers), je Kasse. Saldo = ausgelegt − Anteil; dazu Vorschläge, wer wem wie viel überweist (möglichst wenige).
 * Kassen: eine Familie mit bis zu 2 Erwachsenen zahlt gemeinsam, größere Gruppen (Mannschaft) jeder Erwachsene selbst;
 * Kinder haben nie eine eigene Kasse, ihr Anteil geht an die Eltern (alle Erwachsenen der Familie oder einen festen).
 * Der geplante Gesamtbetrag bleibt davon unberührt: die Kasse zeigt, was tatsächlich ausgegeben wurde.
 */
import { activeTravelers, ageClass, rateOf, type Totals } from "./calc";
import { hhKey, type CatKey, type Expense, type Traveler, type Trip } from "./model";

/* ---------- Kassen ---------- */

export interface Kasse { id: string; name: string; hh: string; person?: string }
const isAdult = (trip: Trip, t: Traveler) => ageClass(t.age, trip.settings, t.kind) === "adult";
/** gemeinsame Kasse der Familie? eingestellt, sonst bis 2 Erwachsene */
export function jointKasse(trip: Trip, hh: string): boolean {
  const set = trip.households?.[hh]?.kasse;
  if (set) return set === "joint";
  return activeTravelers(trip).filter(t => hhKey(t) === hh && isAdult(trip, t)).length <= 2;
}
/** alle Kassen der Reise, in der Reihenfolge der Reisenden */
export function kassen(trip: Trip): Kasse[] {
  const out: Kasse[] = [];
  for (const t of activeTravelers(trip)) {
    const hh = hhKey(t);
    const adults = activeTravelers(trip).filter(x => hhKey(x) === hh && isAdult(trip, x));
    if (jointKasse(trip, hh) || !adults.length) { if (!out.some(k => k.id === hh)) out.push({ id: hh, name: hh, hh }); }
    else if (isAdult(trip, t)) out.push({ id: "p:" + t.id, name: t.name || "?", hh, person: t.id });
  }
  return out;
}
/** auf welche Kasse(n) die Kosten einer Person gehen (mit Anteil): Kinder bei getrennten Kassen an die Eltern */
export function kasseOf(trip: Trip, t: Traveler): [string, number][] {
  const hh = hhKey(t);
  const adults = activeTravelers(trip).filter(x => hhKey(x) === hh && isAdult(trip, x));
  if (jointKasse(trip, hh) || !adults.length) return [[hh, 1]];
  if (isAdult(trip, t)) return [["p:" + t.id, 1]];
  const payer = adults.find(a => a.id === t.payer);
  return payer ? [["p:" + payer.id, 1]] : adults.map(a => ["p:" + a.id, 1 / adults.length] as [string, number]);
}
/** Name einer Kasse (auch für ältere Einträge mit Familiennamen) */
export function kasseName(trip: Trip, id: string): string {
  if (id.startsWith("p:")) return trip.travelers.find(t => t.id === id.slice(2))?.name || "?";
  return id;
}

/**
 * Freigabe einer Ausgabe in einer geteilten Reise: was jemand anderes einreicht, zählt erst, wenn es eine weitere Person
 * bestätigt (✅) oder der Admin übernimmt. Bei Einspruch (❌) entscheidet der Admin: ablehnen oder doch übernehmen.
 * Ohne Konto (lokale Reise) und vom Admin selbst eingetragen: zählt sofort.
 */
export type ExpState = "ok" | "open" | "disputed" | "rejected";
export function expState(e: Expense, owner?: string): ExpState {
  if (e.state === "rejected") return "rejected";
  if (e.state === "approved" || !e.uid || (owner && e.uid === owner)) return "ok";
  if (Object.keys(e.no || {}).length) return "disputed";
  if (Object.keys(e.ok || {}).some(u => u !== e.uid)) return "ok";
  return "open";
}

export interface LedgerEntry {
  key: string;
  kind: "pay" | "exp";
  label: string;
  by: string;
  /** Euro */
  v: number;
  date?: string;
  cat?: CatKey;
  itemId?: string;
  expId?: string;
  payIdx?: number;
  /** Familien, für die es war (fehlt: alle) */
  for?: string[];
  /** Ausgabe: Freigabe (nur „ok“ zählt im Saldo) */
  state?: ExpState;
  exp?: Expense;
}
export interface LedgerRow { hh: string; paid: number; owed: number; bal: number }
export interface Move { from: string; to: string; v: number }
export interface Ledger { entries: LedgerEntry[]; rows: LedgerRow[]; spent: number; moves: Move[]; settled: number; pending: { n: number; v: number; disputed: number } }

export const expEur = (e: Expense, trip: Trip) => (e.amount || 0) / rateOf(e.currency || "EUR", trip.settings);

export function ledger(trip: Trip, T: Totals, owner?: string): Ledger {
  const act = activeTravelers(trip);
  const ks = kassen(trip);
  const ids = new Set(ks.map(k => k.id));
  const paid: Record<string, number> = {}, owed: Record<string, number> = {};
  const add = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] || 0) + v; };
  /** Gutschrift an eine Kasse; älterer Eintrag mit Familienname, die jetzt getrennt zahlt: auf ihre Erwachsenen verteilt */
  const credit = (m: Record<string, number>, by: string, v: number) => {
    if (ids.has(by) || by.startsWith("p:")) return add(m, by, v);
    const parts = ks.filter(k => k.hh === by);
    if (!parts.length) return add(m, by, v);
    parts.forEach(k => add(m, k.id, v / parts.length));
  };
  /** Betrag v nach Gewichten je Person auf deren Kassen verteilen (ohne Gewichte: alle gleich) */
  const spread = (v: number, w: Map<Traveler, number>) => {
    const sum = [...w.values()].reduce((a, b) => a + b, 0);
    const use = sum > 0 ? w : new Map(act.map(t => [t, 1]));
    const tot = sum > 0 ? sum : act.length || 1;
    for (const [t, x] of use) for (const [k, f] of kasseOf(trip, t)) add(owed, k, (v * x * f) / tot);
  };
  /** für wen: Kassen oder Familien → Personen (mit Anteil an der gewählten Kasse) */
  const forWeights = (fs?: string[]): Map<Traveler, number> => {
    if (!fs?.length) return new Map(act.map(t => [t, 1]));
    const w = new Map<Traveler, number>();
    for (const t of act) {
      const share = kasseOf(trip, t).filter(([k]) => fs.includes(k)).reduce((a, [, f]) => a + f, 0);
      const x = fs.includes(hhKey(t)) ? 1 : share;
      if (x > 0) w.set(t, x);
    }
    return w;
  };
  const entries: LedgerEntry[] = [];

  for (const it of trip.items) {
    const r = T.items[it.id];
    if (!it.payments?.length || !r?.counts) continue;
    // Anteil je Person wie in der Abrechnung (Kinderpreise, Nächte …)
    const w = new Map<Traveler, number>();
    for (const t of act) if (r.per[t.id] > 0) w.set(t, r.per[t.id]);
    it.payments.forEach((p, i) => {
      if (!p.by || !(p.amount > 0)) return;
      credit(paid, p.by, p.amount);
      spread(p.amount, w);
      entries.push({ key: `${it.id}:${i}`, kind: "pay", label: it.name, by: p.by, v: p.amount, date: p.at, cat: it.cat, itemId: it.id, payIdx: i });
    });
  }
  const pending = { n: 0, v: 0, disputed: 0 };
  for (const e of trip.expenses || []) {
    const v = expEur(e, trip);
    if (!(v > 0) || !e.by) continue;
    const state = expState(e, owner);
    const base: LedgerEntry = { key: e.id, kind: "exp", label: e.text, by: e.by, v, date: e.date, cat: e.cat, expId: e.id, ...(e.for?.length ? { for: e.for } : {}), state, exp: e };
    if (state !== "ok") {
      if (state !== "rejected") { pending.n++; pending.v += v; if (state === "disputed") pending.disputed++; }
      entries.push(base);
      continue;
    }
    credit(paid, e.by, v);
    spread(v, forWeights(e.for));
    entries.push(base);
  }
  let settled = 0;
  for (const x of trip.transfers || []) {
    if (!(x.amount > 0)) continue;
    // wer überweist, hat damit ausgelegt; wer bekommt, hat das Geld schon „verbraucht“
    credit(paid, x.from, x.amount); credit(owed, x.to, x.amount);
    settled += x.amount;
  }
  const names = [...new Set([...ks.map(k => k.id), ...Object.keys(paid), ...Object.keys(owed)])];
  const rows = names.map(hh => ({ hh, paid: paid[hh] || 0, owed: owed[hh] || 0, bal: (paid[hh] || 0) - (owed[hh] || 0) }));
  const spent = entries.filter(e => !e.state || e.state === "ok").reduce((a, e) => a + e.v, 0);
  entries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { entries, rows, spent, moves: settle(rows), settled, pending };
}

/** Ausgleich mit möglichst wenigen Überweisungen: größter Schuldner zahlt an größten Gläubiger */
export function settle(rows: { hh: string; bal: number }[]): Move[] {
  const pos = rows.filter(r => r.bal > 0.5).map(r => ({ ...r })).sort((a, b) => b.bal - a.bal);
  const neg = rows.filter(r => r.bal < -0.5).map(r => ({ ...r, bal: -r.bal })).sort((a, b) => b.bal - a.bal);
  const out: Move[] = [];
  for (let i = 0, j = 0; i < neg.length && j < pos.length && out.length < 200;) {
    const v = Math.min(neg[i].bal, pos[j].bal);
    if (v > 0.5) out.push({ from: neg[i].hh, to: pos[j].hh, v: Math.round(v * 100) / 100 });
    neg[i].bal -= v; pos[j].bal -= v;
    if (neg[i].bal < 0.5) i++;
    if (pos[j].bal < 0.5) j++;
  }
  return out;
}
