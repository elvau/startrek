/*
 * Zusammensetzung des Gesamtbetrags (#417, #418): gebucht, geplant und versteckte Kosten.
 * Gebucht: Posten gebucht oder bezahlt. Geplant: sichtbare Preise noch nicht gebuchter Posten und einfache Beträge.
 * Versteckt: was in keinem Angebot steht und die App schätzt bzw. erst unterwegs anfällt: Nebenkosten (Kurtaxe, Gepäck …),
 * Anreise zum Flughafen samt Parken, automatische Posten (Verpflegung, Anreise mit dem eigenen Auto). Gebucht zählt immer als gebucht.
 */
import { t, tn, type Key } from "../i18n/index.svelte";
import { CAT_KEYS, FIXED, type Item, type Trip } from "../model";
import { moneyExact, type Totals } from "./index";
import type { ExtraLine } from "./extras";

export type PartKey = "booked" | "planned" | "hidden";
export const PART_KEYS: PartKey[] = ["booked", "planned", "hidden"];

export interface PartRow {
  key: string;
  name: string;
  /** kurz darunter (zu welchem Posten, Status) */
  how?: string;
  /** wie gerechnet (beim Darüberfahren) */
  calc?: string;
  v: number;
  est?: boolean;
  itemId?: string;
}

export interface Parts {
  sum: Record<PartKey, number>;
  rows: Record<PartKey, PartRow[]>;
  /** Kautionen: nie in der Summe, nur als Hinweis */
  deposit: number;
}

/** Rechnung einer Nebenkosten-Zeile in Worten: „2,80 € pro Person und Nacht · 2 zahlen · Kinder bis 15 frei“ */
export function extraHow(l: ExtraLine, cur: string): string {
  const x = l.x;
  if (x.basis === "percent") return `${x.amount} % ${t("xc.ofPrice")}`;
  const parts = [`${moneyExact(x.amount, cur)} ${t(`xc.basis.${x.basis}` as Key)}`];
  if (l.payers != null) parts.push(tn("xc.payers", l.payers));
  if (x.freeUpTo != null) parts.push(t("xc.free", { n: x.freeUpTo }));
  if (x.max) parts.push(t("xc.max", { n: x.max }));
  return parts.join(" · ");
}

const extraName = (l: ExtraLine) => l.x.label || t(`xc.kind.${l.x.kind}` as Key);

/** automatischer Posten, dessen Betrag die App schätzt: Verpflegung, Souvenirs, Anreise mit dem eigenen Auto */
const estimated = (it: Item) => !!it.auto || it.hint === "road:car";

/** Verpflegung u. ä.: „40 € Erw. · 20 € Kind × 7 Tage“ aus dem Preis pro Person */
function priceCalc(it: Item, T: Totals): string | undefined {
  const p = T.items[it.id]?.option?.price;
  if (!p || p.mode !== "person") return undefined;
  const cur = p.currency || "EUR";
  const a = [p.adult ? `${moneyExact(p.adult, cur)} ${t("parts.adult")}` : "", p.child ? `${moneyExact(p.child, cur)} ${t("parts.child")}` : ""].filter(Boolean).join(" · ");
  return a ? (p.qty && p.qty > 1 ? `${a} × ${tn("n.days", p.qty)}` : a) : undefined;
}

export function costParts(trip: Trip, T: Totals): Parts {
  const rows: Record<PartKey, PartRow[]> = { booked: [], planned: [], hidden: [] };
  const add = (k: PartKey, r: PartRow) => { if (Math.abs(r.v) >= 0.005) rows[k].push(r); };
  // einfacher Modus: Beträge sind sichtbar eingetragen, aber nicht gebucht
  for (const cat of CAT_KEYS) {
    const v = T.simple[cat];
    if (v) add("planned", { key: "simple:" + cat, name: t(`ch.${cat}.label` as Key), how: t("parts.simple"), v });
    for (const l of trip.lines || []) {
      if (l.cat !== cat || !(l.amount > 0) || !(cat in T.simple)) continue;
      add("planned", { key: "line:" + l.id, name: l.label || t(`ch.${cat}.label` as Key), how: t("parts.simple"), v: l.amount });
    }
  }
  for (const it of trip.items) {
    const r = T.items[it.id];
    if (!r?.counts) continue;
    const booked = FIXED.includes(it.status);
    const status = t(`status.${it.status}` as Key);
    const ex = r.extras;
    const acc = r.access?.cost || 0;
    if (!booked && estimated(it)) {
      add("hidden", { key: it.id, itemId: it.id, name: it.name, how: t("parts.estimated"), calc: it.auto === "local" ? r.option?.detail : priceCalc(it, T), v: r.net, est: true });
      continue;
    }
    // Angebotspreis ohne Nebenkosten und Anreise
    add(booked ? "booked" : "planned", { key: it.id, itemId: it.id, name: it.name, how: status, v: r.net - (ex?.added || 0) - acc });
    // Parken am Flughafen eigene Zeile (#419): geschätzt versteckt, gebucht bei gebucht
    const lines = r.access?.lines || [];
    const parkEst = lines.reduce((a, l) => a + (l.a.parkBooked ? 0 : l.a.park || 0), 0);
    const parkBooked = lines.reduce((a, l) => a + (l.a.parkBooked ? l.a.park || 0 : 0), 0);
    if (acc) add("hidden", {
      key: it.id + ":access", itemId: it.id, name: t("parts.access"), how: it.name, est: true, v: acc - parkEst - parkBooked,
      calc: lines.map(l => `${l.hh}: ${l.a.info}`).join(" · ")
    });
    const parkCalc = (b: boolean) => lines.filter(l => l.a.park && !!l.a.parkBooked === b).map(l => `${l.hh}: ${moneyExact(l.a.park!, "EUR")}`).join(" · ");
    if (parkEst) add("hidden", { key: it.id + ":park", itemId: it.id, name: t("parts.park", { ap: lines[0].ap }), how: it.name, est: true, v: parkEst, calc: parkCalc(false) });
    if (parkBooked) add("booked", { key: it.id + ":parkB", itemId: it.id, name: t("parts.park", { ap: lines[0].ap }), how: t("status.booked"), v: parkBooked, calc: parkCalc(true) });
    const cur = r.option?.price.currency || "EUR";
    for (const [i, l] of (ex?.lines || []).entries()) {
      if (l.x.off || l.x.pay === "included") continue;
      // bei der Buchung bezahlt (gebucht) steht fest; vor Ort Fälliges bleibt versteckt, bis man dort ist
      const k: PartKey = booked && l.x.pay === "extra" ? "booked" : "hidden";
      add(k, {
        key: `${it.id}:x${i}`, itemId: it.id, name: extraName(l), how: `${it.name} · ${t(l.x.pay === "onsite" ? "parts.onsite" : "parts.atBooking")}`,
        calc: [extraHow(l, cur), l.x.source].filter(Boolean).join(" · "), v: l.amount, est: !!l.x.est
      });
    }
  }
  const sum = Object.fromEntries(PART_KEYS.map(k => [k, rows[k].reduce((a, r) => a + r.v, 0)])) as Record<PartKey, number>;
  return { sum, rows, deposit: T.extras.deposit };
}
