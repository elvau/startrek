import { describe, expect, it } from "vitest";
import { carItem, ONE_WAY_FEE, type CarWindow } from "./extras";
import { quickOf, quickRange, rentalDays, setRental } from "./carclass";

// Landung Fr 07.05. 10:30, Rückflug Mo 10.05. 18:00 → Abholung 11:30, Rückgabe 16:00 = 4 Miettage
const w: CarWindow = { ap: "PMI", pick: "2027-05-07T11:30", drop: "2027-05-10T16:00", days: 4 };
const trip = { from: "2027-05-07", to: "2027-05-10" };

describe("Mietwagen: Klasse und Zeitraum (#391)", () => {
  it("neuer Posten: Kompakt, Zeitraum aus dem Mietfenster, Richtwert gemerkt", () => {
    const it_ = carItem(w, 40);
    expect(it_.rental).toEqual({ cls: "compact", base: 40, from: "2027-05-07", to: "2027-05-10" });
    expect(rentalDays(it_.rental, w)).toBe(4);
    expect(quickOf(it_.rental, w, trip)).toBe(0);
  });
  it("Klasse ändert Preis pro Tag und Sitze, Zeitraum die Tage", () => {
    const it_ = carItem(w, 40);
    setRental(it_, { cls: "van" }, w);
    expect(it_.options[0].price).toMatchObject({ unit: 72, qty: 4, capacity: 9, multiply: true });
    setRental(it_, quickRange(3, it_.rental, w, trip)!, w);
    expect(it_.rental).toMatchObject({ from: "2027-05-07", to: "2027-05-10", days: 3 });
    expect(it_.options[0].price.qty).toBe(3);
    expect(quickOf(it_.rental, w, trip)).toBe(3);
    setRental(it_, quickRange(0, it_.rental, w, trip)!, w);
    expect(it_.rental?.days).toBeUndefined();
    expect(it_.options[0].price.qty).toBe(4);
    setRental(it_, { to: "2027-05-08" }, w);
    expect(it_.options[0].price).toMatchObject({ unit: 72, qty: 1 });
    expect(quickOf(it_.rental, w, trip)).toBe(1);
  });
  it("Einwegmiete: Aufpreis bleibt auf die Tage verteilt", () => {
    const it_ = carItem({ ...w, dropAp: "IBZ" }, 40);
    setRental(it_, { cls: "small" }, w);
    expect(it_.options[0].price.unit).toBeCloseTo(32 + ONE_WAY_FEE / 4);
  });
  it("eingetragenes Angebot behält seinen Preis", () => {
    const it_ = carItem(w, 40);
    it_.options.push({ id: "real", label: "Sixt", price: { mode: "unit", currency: "EUR", unit: 55, qty: 4 } });
    setRental(it_, { cls: "premium" }, w);
    expect(it_.options[1].price).toEqual({ mode: "unit", currency: "EUR", unit: 55, qty: 4 });
    expect(it_.options[0].price.unit).toBe(88);
  });
  it("älterer Posten ohne gespeicherten Richtwert: aus dem geschätzten Preis zurückgerechnet", () => {
    const it_ = carItem(w, 40);
    Reflect.deleteProperty(it_, "rental");
    setRental(it_, { cls: "mid" }, w);
    expect(it_.rental?.base).toBe(40);
    expect(it_.options[0].price.unit).toBe(52);
  });
  it("ohne gültigen Zeitraum keine Tage", () => {
    expect(rentalDays({ from: "2027-05-10", to: "2027-05-07" })).toBeNull();
    expect(rentalDays({ from: "2027-05-07", to: "2027-05-07" })).toBe(1);
  });
});
