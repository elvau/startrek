/*
 * Kasse: wer hat was bezahlt? Zahlungen zu Posten (Payment.by), Ausgaben unterwegs (Trip.expenses) und Ausgleichszahlungen
 * (Trip.transfers), je Familie. Saldo = ausgelegt − Anteil; dazu Vorschläge, wer wem wie viel überweist (möglichst wenige).
 * Der geplante Gesamtbetrag bleibt davon unberührt: die Kasse zeigt, was tatsächlich ausgegeben wurde.
 */
import { activeTravelers, rateOf, type Totals } from "./calc";
import { hhKey, type CatKey, type Expense, type Trip } from "./model";

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
}
export interface LedgerRow { hh: string; paid: number; owed: number; bal: number }
export interface Move { from: string; to: string; v: number }
export interface Ledger { entries: LedgerEntry[]; rows: LedgerRow[]; spent: number; moves: Move[]; settled: number }

export const expEur = (e: Expense, trip: Trip) => (e.amount || 0) / rateOf(e.currency || "EUR", trip.settings);

export function ledger(trip: Trip, T: Totals): Ledger {
  const act = activeTravelers(trip);
  const hhs = [...new Set(act.map(hhKey))];
  const size = (h: string) => act.filter(t => hhKey(t) === h).length;
  const paid: Record<string, number> = {}, owed: Record<string, number> = {};
  const add = (m: Record<string, number>, h: string, v: number) => { m[h] = (m[h] || 0) + v; };
  /** Betrag v nach Gewichten auf Familien verteilen */
  const spread = (v: number, w: Record<string, number>) => {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    if (sum > 0) for (const h in w) add(owed, h, (v * w[h]) / sum);
    else hhs.forEach(h => add(owed, h, (v * size(h)) / Math.max(1, act.length)));
  };
  const entries: LedgerEntry[] = [];

  for (const it of trip.items) {
    const r = T.items[it.id];
    if (!it.payments?.length || !r?.counts) continue;
    // Anteil je Familie wie in der Abrechnung (Kinderpreise, Nächte …)
    const w: Record<string, number> = {};
    for (const t of act) if (r.per[t.id] > 0) add(w, hhKey(t), r.per[t.id]);
    it.payments.forEach((p, i) => {
      if (!p.by || !(p.amount > 0)) return;
      add(paid, p.by, p.amount);
      spread(p.amount, w);
      entries.push({ key: `${it.id}:${i}`, kind: "pay", label: it.name, by: p.by, v: p.amount, date: p.at, cat: it.cat, itemId: it.id, payIdx: i });
    });
  }
  for (const e of trip.expenses || []) {
    const v = expEur(e, trip);
    if (!(v > 0) || !e.by) continue;
    add(paid, e.by, v);
    const fs = e.for?.length ? e.for.filter(h => hhs.includes(h)) : hhs;
    spread(v, Object.fromEntries(fs.map(h => [h, size(h)])));
    entries.push({ key: e.id, kind: "exp", label: e.text, by: e.by, v, date: e.date, cat: e.cat, expId: e.id, ...(e.for?.length ? { for: e.for } : {}) });
  }
  let settled = 0;
  for (const x of trip.transfers || []) {
    if (!(x.amount > 0)) continue;
    // wer überweist, hat damit ausgelegt; wer bekommt, hat das Geld schon „verbraucht“
    add(paid, x.from, x.amount); add(owed, x.to, x.amount);
    settled += x.amount;
  }
  const names = [...new Set([...hhs, ...Object.keys(paid), ...Object.keys(owed)])];
  const rows = names.map(hh => ({ hh, paid: paid[hh] || 0, owed: owed[hh] || 0, bal: (paid[hh] || 0) - (owed[hh] || 0) }));
  const spent = entries.reduce((a, e) => a + e.v, 0);
  entries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { entries, rows, spent, moves: settle(rows), settled };
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
