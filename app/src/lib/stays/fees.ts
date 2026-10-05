/* Steuern und Gebühren aus der Unterkunftssuche als Nebenkosten (#169); ohne Svelte, auch im Such-Dienst nutzbar */
import { uid, type Extra } from "../model";
import type { StayOffer } from "./types";

/** Art aus der Beschreibung, pro Buchung, laut Anbieter (im Preis enthalten oder vor Ort) */
export function feeToExtra(f: NonNullable<StayOffer["fees"]>[number], source: string): Extra {
  const d = f.label.toLowerCase();
  const kind: Extra["kind"] = /city|tourist|kurtax|touris|séjour|soggiorno|occupancy/.test(d) ? "citytax" : /clean|reinig|limpieza|ménage/.test(d) ? "cleaning" : /resort|facility|service/.test(d) ? "resort" : "tax";
  return { id: uid(), kind, label: f.label, amount: f.amount, basis: "booking", pay: f.included ? "included" : "onsite", source };
}

/** vor Ort zu zahlen laut Anbieter (Summe), für ehrliche Vergleiche */
export const onSiteFees = (o: StayOffer) => Math.round((o.fees || []).filter(f => !f.included).reduce((s, f) => s + f.amount, 0));
