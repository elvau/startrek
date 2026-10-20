/*
 * Mietwagen (#391): Fahrzeugklasse und Mietzeitraum am Posten. Beides ändert nur den geschätzten Preis
 * (Angebote mit estimate); eingetragene oder gebuchte Angebote behalten ihren Preis.
 * Klasse: Faktor auf den Richtwert pro Tag (Kompakt, Preisniveau des Ziellandes) und Sitze je Auto.
 */
import { addDays, dayDiff } from "./calc/travel";
import { ONE_WAY_FEE, type CarWindow } from "./extras";
import type { Item, Rental } from "./model";

export const CAR_CLASSES = {
  small: { f: 0.8, seats: 4 },
  compact: { f: 1, seats: 5 },
  mid: { f: 1.3, seats: 5 },
  van: { f: 1.8, seats: 9 },
  premium: { f: 2.2, seats: 5 }
} as const;
export type CarClass = keyof typeof CAR_CLASSES;
export const CLASS_KEYS = Object.keys(CAR_CLASSES) as CarClass[];
/** Schnellwahl der Mietdauer; 0 = ganze Reise */
export const QUICK_DAYS = [0, 1, 3, 5] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Miettage aus dem Zeitraum (mindestens 1); ohne gültigen Zeitraum null. Deckt er sich mit dem Mietfenster der Flüge,
 * zählen dessen 24-Stunden-Tage (Abholung nach der Landung, Rückgabe vor dem Rückflug).
 */
export function rentalDays(r?: Rental, w?: CarWindow | null): number | null {
  if (!r?.from || !r.to || !DAY.test(r.from) || !DAY.test(r.to) || r.to < r.from) return null;
  if (r.days) return r.days;
  if (w && w.pick.slice(0, 10) === r.from && w.drop.slice(0, 10) === r.to) return w.days;
  return Math.max(1, dayDiff(r.from, r.to));
}

/** Zeitraum zur Schnellwahl: ganze Reise aus dem Mietfenster der Flüge (sonst Reisedaten), sonst n Tage ab Mietbeginn */
export function quickRange(n: number, cur: Rental | undefined, w: CarWindow | null, trip: { from?: string; to?: string }): Partial<Rental> | null {
  const whole = w ? { from: w.pick.slice(0, 10), to: w.drop.slice(0, 10) } : trip.from && trip.to ? { from: trip.from, to: trip.to } : null;
  if (!n) return whole && { ...whole, days: undefined };
  const from = cur?.from || whole?.from;
  // Tage ausdrücklich: „3 Tage“ bleibt 3, auch wenn der Zeitraum dem Mietfenster gleicht
  return from ? { from, to: addDays(from, n), days: n } : null;
}

/** Schnellwahl, die zum Zeitraum passt (für die Markierung); sonst null */
export function quickOf(r: Rental | undefined, w: CarWindow | null, trip: { from?: string; to?: string }): number | null {
  const d = rentalDays(r, w);
  if (d == null) return null;
  const whole = quickRange(0, r, w, trip);
  if (!r!.days && whole && whole.from === r!.from && whole.to === r!.to) return 0;
  return QUICK_DAYS.find(n => n && n === d) ?? null;
}

/** Richtwert Kompakt pro Tag: gespeichert, sonst aus dem geschätzten Angebot zurückgerechnet */
function baseOf(it: Item): number | null {
  if (it.rental?.base) return it.rental.base;
  const o = it.options.find(x => x.estimate && x.price.mode === "unit");
  if (!o?.price.unit) return null;
  const days = o.price.qty || 1, cls = CAR_CLASSES[it.rental?.cls || "compact"];
  return Math.round(((o.price.unit - (it.rental?.oneWay ? ONE_WAY_FEE / days : 0)) / cls.f) * 100) / 100;
}

/** Klasse bzw. Zeitraum setzen und geschätzte Angebote nachrechnen (Preis pro Tag × Tage, Sitze für die Zahl der Autos) */
export function setRental(it: Item, patch: Partial<Rental>, w?: CarWindow | null): void {
  const base = baseOf(it);
  const r: Rental = { ...(it.rental || {}), ...patch, ...(base ? { base } : {}) };
  // neuer Zeitraum aus dem Kalender: Tage wieder aus den Daten
  if ((patch.from || patch.to) && !("days" in patch)) delete r.days;
  if (r.days === undefined) delete r.days;
  it.rental = r;
  const days = rentalDays(r, w);
  const cls = CAR_CLASSES[r.cls || "compact"];
  for (const o of it.options) {
    if (!o.estimate || o.price.mode !== "unit" || !base) continue;
    const d = days ?? (o.price.qty || 1);
    o.price = { ...o.price, unit: Math.round((base * cls.f + (r.oneWay ? ONE_WAY_FEE / d : 0)) * 100) / 100, qty: d, capacity: cls.seats, multiply: true };
  }
}
