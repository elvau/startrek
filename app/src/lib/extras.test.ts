import { describe, expect, it } from "vitest";
import { calcItem } from "./calc";
import { carItem, carPerDay, carWindow, insuranceEstimate, insuranceItem, kayakCarLink } from "./extras";
import { DEFAULT_SETTINGS, type Trip } from "./model";

const leg = (dir: "out" | "back", from: string, to: string, dep: string, arr: string) => ({ dir, from, to, dep, arr, stops: 0 });
function trip(): Trip {
  return {
    id: "t", name: "", place: "", country: "", travelers: [{ id: "a", name: "A", household: "X" }], tiers: {}, settings: DEFAULT_SETTINGS,
    items: [{ id: "f", cat: "flights", name: "Flug", status: "chosen", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 138 },
      legs: [leg("out", "EIN", "PMI", "2026-10-15T10:00", "2026-10-15T12:20"), leg("back", "PMI", "EIN", "2026-10-19T18:00", "2026-10-19T20:20")] }] }]
  };
}

describe("Mietwagen", () => {
  it("Abholung 1 h nach der Landung, Rückgabe 2 h vor dem Rückflug, Tage aufgerundet", () => {
    const w = carWindow(trip())!;
    expect(w).toEqual({ ap: "PMI", pick: "2026-10-15T13:20", drop: "2026-10-19T16:00", days: 5 });
    expect(kayakCarLink(w)).toBe("https://www.kayak.de/cars/PMI/2026-10-15-13h/2026-10-19-16h");
    const it = carItem(w);
    expect(it).toMatchObject({ cat: "transport", icon: "car", options: [{ estimate: true, price: { mode: "unit", unit: 40, qty: 5 } }] });
    expect(it.note).toContain("PMI");
  });
  it("Rückgabe an anderem Flughafen (Rundreise): Einwegmiete mit Aufpreis, KAYAK mit beiden Orten", () => {
    const t = trip();
    t.items[0].options[0].legs = [leg("out", "FRA", "SFO", "2027-08-20T10:00", "2027-08-20T15:50"), leg("back", "SAN", "FRA", "2027-09-02T17:15", "2027-09-03T12:40")];
    const w = carWindow(t)!;
    expect(w).toMatchObject({ ap: "SFO", dropAp: "SAN" });
    expect(kayakCarLink(w)).toMatch(/cars\/SFO\/SAN\//);
    const it = carItem(w);
    expect(it.note).toContain("SAN");
    expect(calcItem(it, t).net).toBeCloseTo(40 * w.days + 150, 0);
  });
  it("größere Gruppe: ein Auto je 5 Personen", () => {
    const t = trip();
    const w = carWindow(t)!;
    expect(calcItem(carItem(w), t).net).toBe(200);
    t.travelers = Array.from({ length: 12 }, (_, i) => ({ id: "p" + i, name: "P" + i, household: "X" }));
    expect(calcItem(carItem(w), t).net).toBe(3 * 200);
  });
  it("Tagespreis nach Preisniveau des Landes (Spanien günstiger, Island teurer), mindestens 15 €", () => {
    expect(carPerDay()).toBe(40);
    expect(carPerDay(0.8)).toBe(34);
    expect(carPerDay(1.47)).toBe(52);
    expect(carPerDay(0.1)).toBe(15);
  });
  it("ohne Flüge: Reisedaten, ohne Daten kein Zeitfenster", () => {
    const t = trip();
    t.items = [];
    expect(carWindow(t)).toBeNull();
    t.from = "2026-10-15"; t.to = "2026-10-18";
    expect(carWindow(t)).toEqual({ pick: "2026-10-15T10:00", drop: "2026-10-18T10:00", days: 3 });
  });
});

describe("Reiseversicherung", () => {
  it("Richtwert: 4 % der Reisekosten plus 12 € pro Person", () => {
    expect(insuranceEstimate(2000, 4)).toBe(128);
    expect(insuranceItem(500, 1)).toMatchObject({ cat: "misc", icon: "shield", options: [{ estimate: true, price: { unit: 32 } }] });
  });
});
