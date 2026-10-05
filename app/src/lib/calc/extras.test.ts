import { describe, expect, it } from "vitest";
import { totals } from "./index";
import { DEFAULT_SETTINGS, type Extra, type Item, type Trip } from "../model";

const trip = (items: Item[], extra: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25", tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [
    { id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 },
    { id: "c", name: "Tom", household: "Smith", age: 38 }, { id: "d", name: "Mia", household: "Smith", age: 36 }
  ],
  items, detail: { flights: true, stay: true, transport: true, attractions: true, misc: true }, ...extra
} as Trip);
const x = (o: Partial<Extra>): Extra => ({ id: Math.random().toString(36).slice(2), kind: "other", amount: 0, basis: "booking", pay: "onsite", ...o });
const villa = (extras: Extra[], deposit?: Item["options"][number]["deposit"]): Item => ({ id: "s", cat: "stay", name: "Villa", status: "chosen", from: "2027-07-18", to: "2027-07-25",
  options: [{ id: "v", label: "Villa", price: { mode: "unit", currency: "EUR", unit: 980, basis: "stay" }, extras, ...(deposit ? { deposit } : {}) }] });

describe("Nebenkosten", () => {
  it("Kurtaxe pro Person und Nacht, Kinder bis 12 frei: 3 Erwachsene × 7 Nächte", () => {
    const T = totals(trip([villa([x({ kind: "citytax", amount: 2.8, basis: "personNight", freeUpTo: 12, est: true })])]));
    const r = T.items.s;
    expect(r.base).toBeCloseTo(980);
    expect(r.extras!.lines[0].amount).toBeCloseTo(58.8);
    expect(r.extras!.lines[0].payers).toBe(3);
    expect(r.net).toBeCloseTo(1038.8);
    expect(T.total).toBeCloseTo(1038.8);
    expect(T.extras).toMatchObject({ onsite: expect.closeTo(58.8, 5), est: expect.closeTo(58.8, 5), extra: 0 });
    // Ben (9) zahlt keine Kurtaxe, nur seinen Teil der Villa
    expect(T.byPerson.b).toBeCloseTo(245);
    expect(T.byPerson.a).toBeCloseTo(245 + 19.6);
  });

  it("höchstens so viele Nächte, pro Buchung, pro Nacht und Prozent", () => {
    const T = totals(trip([villa([
      x({ kind: "citytax", amount: 2, basis: "personNight", max: 5 }),
      x({ kind: "cleaning", amount: 80, basis: "booking" }),
      x({ kind: "resort", amount: 10, basis: "night" }),
      x({ kind: "tax", amount: 10, basis: "percent", pay: "extra" })
    ])]));
    const l = T.items.s.extras!.lines.map(v => Math.round(v.amount * 100) / 100);
    expect(l).toEqual([40, 80, 70, 98]);
    expect(T.extras.onsite).toBeCloseTo(190);
    expect(T.extras.extra).toBeCloseTo(98);
    expect(T.total).toBeCloseTo(980 + 288);
  });

  it("im Preis enthalten und weggeklickt zählen nicht", () => {
    const T = totals(trip([villa([x({ kind: "tax", amount: 50, pay: "included" }), x({ kind: "cleaning", amount: 80, off: true })])]));
    expect(T.total).toBeCloseTo(980);
    expect(T.extras.included).toBeCloseTo(50);
    expect(T.items.s.extras!.lines).toHaveLength(2);
  });

  it("Kaution nie in den Kosten, aber im Überblick", () => {
    const T = totals(trip([villa([], { amount: 300, how: "cash" })]));
    expect(T.total).toBeCloseTo(980);
    expect(T.extras.deposit).toBe(300);
    expect(T.extras.deposits).toEqual(["s"]);
  });

  it("geteilter Posten: nur die Beteiligten zahlen; Mietwagen pro Tag je Auto", () => {
    const car: Item = { id: "car", cat: "transport", name: "Mietwagen", icon: "car", status: "idea", participants: ["a", "b"],
      options: [{ id: "c", label: "Auto", price: { mode: "unit", currency: "EUR", unit: 35, qty: 5 }, extras: [x({ kind: "insurance", amount: 14, basis: "day", est: true })], deposit: { amount: 1200, how: "credit" } }] };
    const T = totals(trip([car]));
    expect(T.items.car.extras!.added).toBeCloseTo(70);
    expect(T.byPerson.a).toBeCloseTo((175 + 70) / 2);
    expect(T.byPerson.c || 0).toBe(0);
    expect(T.extras.deposit).toBe(1200);
  });

  it("bezahlt: was vor Ort zu zahlen ist, bleibt offen", () => {
    const it = villa([x({ kind: "citytax", amount: 20, basis: "booking" })]);
    it.status = "paid";
    expect(totals(trip([it])).paid).toBeCloseTo(980);
  });
});
