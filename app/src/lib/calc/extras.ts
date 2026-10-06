/*
 * Nebenkosten je Angebot (Epic Preistransparenz, #169): Kurtaxe, Endreinigung, Gepäck … pro Person, Nacht, Tag, Buchung
 * oder in Prozent. „Im Preis enthalten“ wird nur gezeigt, „vor Ort“ und „zusätzlich“ kommen zu den Kosten dazu.
 * Kautionen werden nur geblockt und zählen nie zu den Kosten.
 */
import type { Deposit, Extra, Option, Settings, Traveler } from "../model";

export interface ExtraLine {
  x: Extra;
  /** Betrag in Euro für diesen Posten (alle Beteiligten) */
  amount: number;
  /** wie viele zahlen (pro Person) */
  payers?: number;
}

export interface ExtrasCalc {
  lines: ExtraLine[];
  /** vor Ort zu zahlen */
  onsite: number;
  /** bei der Buchung zusätzlich (z. B. Gepäck) */
  extra: number;
  /** im Preis enthalten (nur zur Info) */
  included: number;
  /** davon geschätzt (vor Ort bzw. zusätzlich) */
  est: number;
  /** kommt zu den Kosten dazu: vor Ort + zusätzlich */
  added: number;
  /** Anteil je Person (nur was dazukommt) */
  per: Record<string, number>;
  /** Kaution in Euro (nie in den Kosten) */
  deposit: number;
  /** die Kaution selbst (eigene oder geschätzte) */
  dep?: Deposit;
}

export interface ExtrasCtx {
  /** Nächte des Aufenthalts bzw. der Reise */
  nights: number;
  /** Tage (Mietwagen: gemietete Tage, sonst Reisetage) */
  days: number;
  /** Nächte je Person (Unterkunft mit Anwesenheit); fehlt: alle gleich */
  w?: Record<string, number>;
  /** Anteil je Person am Angebotspreis in Euro (für Prozent und als Gewicht) */
  basePer: Record<string, number>;
  /** Umrechnung in Euro (1 / Kurs) */
  fx: number;
  /** gebuchte Einheiten (z. B. Autos): Beträge pro Buchung, Nacht oder Tag gelten je Einheit */
  units?: number;
  settings: Settings;
}

/** frei bis einschließlich freeUpTo; Kinder ohne Alter gelten als frei, wenn die Grenze das Kindesalter abdeckt */
function isFree(t: Traveler, x: Extra, s: Settings): boolean {
  if (x.freeUpTo == null) return false;
  const age = t.age != null && (t.age as unknown) !== "" && isFinite(Number(t.age)) ? Number(t.age) : null;
  if (age != null) return age <= x.freeUpTo;
  return (t.kind === "child" || t.kind === "infant") && x.freeUpTo >= s.adultAge - 1;
}

const cap = (n: number, max?: number) => (max && max > 0 ? Math.min(n, max) : n);

export function calcExtras(opt: Option, people: Traveler[], c: ExtrasCtx): ExtrasCalc {
  const r: ExtrasCalc = { lines: [], onsite: 0, extra: 0, included: 0, est: 0, added: 0, per: {}, deposit: 0 };
  if (opt.deposit?.amount && opt.deposit.amount > 0) { r.deposit = opt.deposit.amount * c.fx; r.dep = opt.deposit; }
  if (!opt.extras?.length || !people.length) return r;
  // Gewicht je Person für Beträge pro Buchung, Nacht oder Tag: Anwesenheit, sonst gleich
  const wt = (t: Traveler) => (c.w ? c.w[t.id] || 0 : 1);
  const sumW = people.reduce((a, t) => a + wt(t), 0) || 1;
  const baseSum = people.reduce((a, t) => a + (c.basePer[t.id] || 0), 0);
  for (const x of opt.extras) {
    const per: Record<string, number> = {};
    let payers: number | undefined;
    const v = (x.amount || 0) * c.fx, u = Math.max(1, x.maxUnits ? Math.min(x.maxUnits, c.units || 1) : c.units || 1);
    const split = (total: number) => people.forEach(t => (per[t.id] = (total * wt(t)) / sumW));
    switch (x.basis) {
      case "person": case "personNight": case "personDay": {
        const pay = people.filter(t => !isFree(t, x, c.settings) && wt(t) > 0);
        payers = pay.length;
        pay.forEach(t => {
          const k = x.basis === "person" ? 1 : cap(x.basis === "personNight" ? (c.w?.[t.id] ?? c.nights) : c.days, x.max);
          per[t.id] = v * k;
        });
        break;
      }
      case "night": split(v * cap(c.nights, x.max) * u); break;
      case "day": split(v * cap(c.days, x.max) * u); break;
      case "percent":
        people.forEach(t => (per[t.id] = ((c.basePer[t.id] || 0) * (x.amount || 0)) / 100));
        if (!baseSum) split(0);
        break;
      default: split(v * u);
    }
    const amount = Object.values(per).reduce((a, b) => a + b, 0);
    r.lines.push({ x, amount, ...(payers != null ? { payers } : {}) });
    if (x.off) continue;
    if (x.pay === "included") { r.included += amount; continue; }
    if (x.pay === "onsite") r.onsite += amount; else r.extra += amount;
    if (x.est) r.est += amount;
    for (const id in per) r.per[id] = (r.per[id] || 0) + per[id];
  }
  r.added = r.onsite + r.extra;
  return r;
}
