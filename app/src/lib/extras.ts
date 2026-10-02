/*
 * Mietwagen und Reiseversicherung als Richtwert-Posten, dazu Links zum Vergleichen.
 * Mietwagen: Abholung 1 Stunde nach der Landung, Rückgabe 2 Stunden vor dem Rückflug (aus den Flügen),
 * sonst Reisedaten 10:00. Versicherung: neutrale Schätzung (keine Beratung, kein Tarifvergleich).
 */
import { t } from "./i18n/index.svelte";
import { uid, type Item, type Trip } from "./model";
import { shiftLocal } from "./format";
import { arrivals } from "./stays/presence";

export interface CarWindow {
  /** Flughafen am Ziel (IATA), falls aus Flügen bekannt */
  ap?: string;
  /** JJJJ-MM-TTTHH:MM */
  pick: string;
  drop: string;
  days: number;
}

/** Richtwerte: Kompaktklasse pro Tag, Versicherung (Reiserücktritt in % der Reisekosten, Auslandskranken pro Person) */
export const CAR_PER_DAY = 40;
export const INS_RATE = 0.04;
export const INS_PER_PERSON = 12;

export function carWindow(trip: Trip): CarWindow | null {
  const arr = arrivals(trip);
  const ins = arr.filter(a => a.arr && a.arr.length >= 16).sort((a, b) => a.arr!.localeCompare(b.arr!));
  const outs = arr.filter(a => a.dep && a.dep.length >= 16).sort((a, b) => b.dep!.localeCompare(a.dep!));
  const pick = ins[0] ? shiftLocal(ins[0].arr!, 1) : trip.from ? `${trip.from}T10:00` : "";
  const drop = outs[0] ? shiftLocal(outs[0].dep!, -2) : trip.to ? `${trip.to}T10:00` : "";
  if (!pick || !drop || drop <= pick) return null;
  const days = Math.max(1, Math.ceil((Date.parse(`${drop}:00Z`) - Date.parse(`${pick}:00Z`)) / 86400000));
  return { ...(ins[0]?.arrAp ? { ap: ins[0].arrAp } : {}), pick, drop, days };
}

/** KAYAK-Mietwagensuche mit Ort und Zeiten (volle Stunden) */
export function kayakCarLink(w: CarWindow, place = ""): string {
  const at = (iso: string) => `${iso.slice(0, 10)}-${iso.slice(11, 13)}h`;
  const where = w.ap || encodeURIComponent(place);
  return `https://www.kayak.de/cars/${where}/${at(w.pick)}/${at(w.drop)}`;
}
export const CAR_LINKS = [
  { name: "CHECK24", url: "https://www.check24.de/mietwagen/" },
  { name: "DiscoverCars", url: "https://www.discovercars.com/de" }
];
export const INSURANCE_LINKS = [
  { name: "CHECK24", url: "https://www.check24.de/reiseversicherung/" },
  { name: "ERGO Reiseversicherung", url: "https://www.reiseversicherung.de/" },
  { name: "HanseMerkur", url: "https://www.hansemerkur.de/reiseversicherung" },
  { name: "Allianz Travel", url: "https://www.allianz-reiseversicherung.de/" }
];

const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}. ${iso.slice(11, 16)}`;

/** Tagespreis am Ziel: Richtwert × Preisniveau des Landes (wie bei der Verpflegung gedämpft), mindestens 15 € */
export const carPerDay = (pli?: number) => Math.max(15, Math.round(CAR_PER_DAY * Math.pow(pli || 1, 0.7)));

/** Plätze je Mietwagen (Kompaktklasse mit Gepäck) */
export const CAR_SEATS = 5;

/** Mietwagen-Posten mit Richtwert für die Tage am Ziel; größere Gruppen brauchen mehrere Autos (je 5 Plätze) */
export function carItem(w: CarWindow, perDay = CAR_PER_DAY): Item {
  return {
    id: uid(), cat: "transport", name: t("car.name"), icon: "car", status: "idea",
    note: t("car.note", { ap: w.ap || "", a: fmt(w.pick), b: fmt(w.drop) }).replace(/\s+/g, " "),
    options: [{ id: uid(), label: t("car.estimate"), estimate: true, price: { mode: "unit", currency: "EUR", unit: perDay, qty: w.days, capacity: CAR_SEATS, multiply: true } }]
  };
}

/** Schätzung Reiseversicherung: Reiserücktritt auf die Reisekosten plus Auslandskranken je Person */
export const insuranceEstimate = (tripCost: number, persons: number) => Math.round(tripCost * INS_RATE + Math.max(1, persons) * INS_PER_PERSON);

export function insuranceItem(tripCost: number, persons: number): Item {
  return {
    id: uid(), cat: "misc", name: t("ins.name"), icon: "shield", status: "idea", note: t("ins.note"),
    options: [{ id: uid(), label: t("ins.estimate"), estimate: true, price: { mode: "unit", currency: "EUR", unit: insuranceEstimate(tripCost, persons) } }]
  };
}
