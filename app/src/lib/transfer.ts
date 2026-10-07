/*
 * Flughafentransfer am Ziel: vom Ankunftsflughafen zur Unterkunft und zurück, als Richtwert-Posten.
 * Fahrzeug nach Gruppengröße (mit Gepäck: Taxi bis 3, Van bis 7, Kleinbus bis 16, darüber Reisebusse),
 * Preis je Fahrt aus Grundpreis und Kilometern, angepasst ans Preisniveau des Landes. Anbieter-Links: partners/.
 */
import { t } from "./i18n/index.svelte";
import { uid, type Item } from "./model";
import { kmBetween } from "./geo/places";

export interface Pt { lat: number; lon: number }
export type Vehicle = "taxi" | "van" | "minibus" | "coach";

/** Richtwerte je Fahrt (Deutschland = 1): Grundpreis, je Straßen-km, Plätze mit Gepäck */
const RATES: Record<Vehicle, { base: number; km: number; seats: number }> = {
  taxi: { base: 25, km: 1.6, seats: 3 },
  van: { base: 35, km: 2.0, seats: 7 },
  minibus: { base: 70, km: 2.8, seats: 16 },
  coach: { base: 150, km: 3.5, seats: 50 }
};

export interface TransferPlan {
  ap: string;
  /** Ziel am Ort: Unterkunft oder Ortsmitte */
  to: string;
  /** Straßen-km eine Richtung */
  km: number;
  vehicle: Vehicle;
  count: number;
  /** Euro je Fahrt für alle Fahrzeuge */
  perRide: number;
}

/** passendes Fahrzeug: das kleinste, in das alle passen; bei sehr großen Gruppen mehrere Reisebusse */
export function vehicleFor(persons: number): { vehicle: Vehicle; count: number } {
  const n = Math.max(1, persons);
  const v = (["taxi", "van", "minibus"] as const).find(k => n <= RATES[k].seats);
  return v ? { vehicle: v, count: 1 } : { vehicle: "coach", count: Math.ceil(n / RATES.coach.seats) };
}

/** Preis je Fahrt für alle Fahrzeuge (Fahrdienst, Taxi, Bus) bei km Straße */
export function ridePrice(persons: number, km: number, pli = 1): { vehicle: Vehicle; count: number; perRide: number } {
  const { vehicle, count } = vehicleFor(persons);
  const r = RATES[vehicle], level = Math.pow(pli || 1, 0.7);
  return { vehicle, count, perRide: Math.round((r.base + r.km * km) * level * count) };
}

export function transferPlan(ap: { code: string } & Pt, dest: { name: string } & Pt, persons: number, pli = 1): TransferPlan {
  const km = Math.max(3, kmBetween(ap, dest) * 1.3);
  return { ap: ap.code, to: dest.name, km, ...ridePrice(persons, km, pli) };
}

export interface TransferLeg { plan: TransferPlan; ap: { code: string } & Pt; dest: { name: string } & Pt }

/**
 * Ein Transfer je Unterkunft/Ziel: der nächste Flughafen der Reise (Anreise, Abreise), sonst der nächste große
 * (fallback); weiter als maxKm entfernt gibt keinen Transfer. Gleiche Strecken nur einmal.
 */
export function transferLegs(dests: ({ name: string } & Pt)[], aps: ({ code: string } & Pt)[], fallback: (d: Pt) => ({ code: string } & Pt) | null, persons: number, pli = 1, maxKm = 150): TransferLeg[] {
  const out: TransferLeg[] = [];
  for (const dest of dests) {
    let ap = aps.reduce<({ code: string } & Pt) | null>((b, a) => (!b || kmBetween(a, dest) < kmBetween(b, dest) ? a : b), null);
    if (!ap || kmBetween(ap, dest) > maxKm) ap = fallback(dest);
    if (!ap || kmBetween(ap, dest) > maxKm || out.some(l => l.ap.code === ap!.code && l.dest.name === dest.name)) continue;
    out.push({ plan: transferPlan(ap, dest, persons, pli), ap, dest });
  }
  return out;
}

/** Posten „Flughafentransfer“: zwei Fahrten (hin und zurück), Preis für die ganze Gruppe */
export function transferItem(p: TransferPlan): Item {
  return {
    id: uid(), cat: "transport", name: t("tr.name"), icon: "car", status: "idea",
    note: t("tr.note", { ap: p.ap, to: p.to, km: Math.round(p.km) }),
    options: [{ id: uid(), label: t("tr.estimate", { v: vehicleText(p) }), estimate: true, price: { mode: "unit", currency: "EUR", unit: p.perRide, qty: 2 } }]
  };
}

export const vehicleText = (p: Pick<TransferPlan, "vehicle" | "count">) => `${p.count > 1 ? `${p.count} × ` : ""}${t(`tr.v.${p.vehicle}`)}`;
