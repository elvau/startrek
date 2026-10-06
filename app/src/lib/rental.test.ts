import { describe, expect, it } from "vitest";
import { totals } from "./calc";
import { DEFAULT_SETTINGS, type Item, type Option, type Trip } from "./model";
import { RENTAL, autoDeposit, isRental, youngDrivers } from "./fees";
import { importantPoints } from "./important";

const trip = (items: Item[], ages: (number | null)[] = [40, 22]): Trip => ({
  id: "t", name: "Test", place: "Testort", country: "Testland", from: "2027-07-18", to: "2027-07-25", tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: ages.map((age, i) => ({ id: String.fromCharCode(97 + i), name: `P${i}`, household: "Klein", age })),
  items, detail: { flights: true, stay: true, transport: true, attractions: true, misc: true }
} as Trip);
const car = (o: Partial<Option> = {}, it: Partial<Item> = {}): Item => ({ id: "car", cat: "transport", name: "Mietwagen", icon: "car", status: "idea",
  options: [{ id: "c", label: "Auto", estimate: true, price: { mode: "unit", currency: "EUR", unit: 40, qty: 7, capacity: 5, multiply: true }, ...o }], ...it });

describe("Mietwagen (#172)", () => {
  it("erkannt am Auto-Symbol, nicht das eigene Auto der Anreise", () => {
    expect(isRental(car())).toBe(true);
    expect(isRental(car({}, { hint: "road:car" }))).toBe(false);
    expect(isRental({ ...car(), name: "Flughafentransfer" })).toBe(false);
    expect(isRental({ ...car(), name: "Auto", hint: "rental" })).toBe(true);
  });
  it("junge Fahrer: Erwachsene mit Alter unter 25 unter den Beteiligten", () => {
    expect(youngDrivers(car(), trip([])).map(t => t.name)).toEqual(["P1"]);
    expect(youngDrivers(car({}, { participants: ["a"] }), trip([]))).toEqual([]);
    // Kinder und Personen ohne Alter zählen nicht
    expect(youngDrivers(car(), trip([], [40, 9, null]))).toEqual([]);
  });
  it("Aufpreis junge Fahrer pro Tag eingerechnet; Vollschutz und Zusatzfahrer nur auf Wunsch", () => {
    const T = totals(trip([car()]));
    const ex = T.items.car.extras!;
    expect(ex.lines.map(l => [l.x.kind, !!l.x.off])).toEqual([["young", false], ["cover", true], ["driver", true]]);
    expect(ex.added).toBeCloseTo(RENTAL.young * 7);
    expect(T.total).toBeCloseTo(280 + RENTAL.young * 7);
    const on = totals(trip([car({ autoOn: ["auto:cover"], autoOff: ["auto:young"] })])).items.car.extras!;
    expect(on.added).toBeCloseTo(RENTAL.cover * 7);
  });
  it("Aufpreis junge Fahrer je junger Person, höchstens je Auto (#209)", () => {
    // 6 Reisende, Kapazität 3 → 2 Autos
    const two = () => car({ price: { mode: "unit", currency: "EUR", unit: 40, qty: 7, capacity: 3, multiply: true } });
    const added = (ages: number[]) => totals(trip([two()], ages)).items.car.extras!.added;
    expect(totals(trip([two()], [40, 40, 40, 40, 40, 22])).items.car.units).toBe(2);
    expect(added([40, 40, 40, 40, 40, 22])).toBeCloseTo(RENTAL.young * 7);
    expect(added([40, 40, 40, 22, 22, 22])).toBeCloseTo(RENTAL.young * 7 * 2);
    // ein Auto: wie bisher
    expect(totals(trip([car()])).items.car.extras!.added).toBeCloseTo(RENTAL.young * 7);
  });
  it("Kaution geschätzt, nur Kreditkarte, nie in den Kosten; eigene Angabe geht vor, ausblendbar", () => {
    const T = totals(trip([car()], [40]));
    expect(T.total).toBeCloseTo(280);
    expect(T.extras.deposit).toBe(RENTAL.deposit);
    expect(T.items.car.extras!.dep).toMatchObject({ amount: RENTAL.deposit, how: "credit", est: true });
    expect(autoDeposit(car(), { ...car().options[0], deposit: { amount: 300 } })).toBeUndefined();
    expect(totals(trip([car({ autoOff: ["auto:deposit"] })], [40])).extras.deposit).toBe(0);
    expect(totals(trip([car({ deposit: { amount: 500, how: "card" } })], [40])).extras.deposit).toBe(500);
  });
  it("geschätzte Kaution erscheint in Wichtiges als dringend", () => {
    const p = importantPoints({ trip: trip([car()], [40]), countries: [], hints: [], visa: {} as never, advice: {} }).find(x => x.kind === "deposit");
    expect(p).toMatchObject({ key: "deposit:car", prio: 1, deposit: { amount: RENTAL.deposit, how: "credit", name: "Mietwagen" } });
  });
});
