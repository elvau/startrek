import { describe, expect, it } from "vitest";
import { activeOption, ageClass, bestTier, calcItem, parseNum, totals } from "./index";
import { DEFAULT_SETTINGS, type Item, type Trip } from "../model";

const family = (): Trip => ({
  id: "t", name: "Test", place: "Makarska", country: "HR",
  travelers: [
    { id: "a", name: "Anna", age: 41, household: "Klein" },
    { id: "j", name: "Jonas", age: 43, household: "Klein" },
    { id: "m", name: "Mia", age: 11, household: "Klein" },
    { id: "b", name: "Ben", age: 4, household: "Klein" }
  ],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS, rates: { EUR: 1, JPY: 170 } }
});
const item = (x: Partial<Item>): Item => ({ id: "i", cat: "attractions", name: "X", status: "chosen", options: [], ...x });

describe("Altersklassen", () => {
  it("ab 12 Erwachsener, ab 6 Kind, darunter Kleinkind", () => {
    expect(ageClass(12, DEFAULT_SETTINGS)).toBe("adult");
    expect(ageClass(11, DEFAULT_SETTINGS)).toBe("child");
    expect(ageClass(6, DEFAULT_SETTINGS)).toBe("child");
    expect(ageClass(5, DEFAULT_SETTINGS)).toBe("infant");
    expect(ageClass(undefined, DEFAULT_SETTINGS)).toBe("adult");
    expect(ageClass(null, DEFAULT_SETTINGS)).toBe("adult");
  });
});

describe("Gruppenrabatt", () => {
  it("nimmt den höchsten erreichten Rabatt", () => {
    const tiers = [{ min: 4, pct: 5 }, { min: 6, pct: 10 }, { min: 10, pct: 20 }];
    expect(bestTier(tiers, 3)).toBeNull();
    expect(bestTier(tiers, 7)).toEqual({ min: 6, pct: 10 });
  });
  it("ignoriert unvollständige Stufen", () => {
    expect(bestTier([{ min: 0, pct: 50 }, { min: 2, pct: 0 }], 5)).toBeNull();
  });
});

describe("Preis pro Person", () => {
  it("Kinderpreis für Kinder, Kleinkindpreis für Kleinkinder", () => {
    const t = family();
    const r = calcItem(item({ options: [{ id: "o", label: "Krka", price: { mode: "person", currency: "EUR", adult: 40, child: 15, infant: 0 } }] }), t);
    expect(r.net).toBe(40 + 40 + 15 + 0);
    expect(r.per).toEqual({ a: 40, j: 40, m: 15, b: 0 });
  });
  it("ohne Kinderpreis zahlen Kinder den Erwachsenenpreis, Kleinkinder den Kinderpreis", () => {
    const t = family();
    expect(calcItem(item({ options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 10 } }] }), t).net).toBe(40);
    expect(calcItem(item({ options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 10, child: 4 } }] }), t).net).toBe(28);
  });
  it("Menge multipliziert, Fremdwährung wird umgerechnet", () => {
    const t = family();
    const r = calcItem(item({ options: [{ id: "o", label: "", price: { mode: "person", currency: "JPY", adult: 1700, qty: 3 } }] }), t);
    expect(r.net).toBeCloseTo(4 * 30);
  });
  it("nur Beteiligte zahlen", () => {
    const t = family();
    const r = calcItem(item({ participants: ["a", "m"], options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 75, child: 45 } }] }), t);
    expect(r.n).toBe(2);
    expect(r.net).toBe(120);
  });
  it("Gruppenrabatt der Kategorie greift", () => {
    const t = family(); t.tiers.attractions = [{ min: 4, pct: 10 }];
    const r = calcItem(item({ options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 10 } }] }), t);
    expect(r.gross).toBe(40);
    expect(r.net).toBe(36);
    expect(r.saved).toBe(4);
    expect(r.per.a).toBe(9);
  });
  it("eigener Rabatt des Postens ersetzt den der Kategorie", () => {
    const t = family(); t.tiers.attractions = [{ min: 2, pct: 50 }];
    const r = calcItem(item({ tier: { min: 4, pct: 25 }, options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 10 } }] }), t);
    expect(r.net).toBe(30);
  });
});

describe("Pauschale pro Einheit", () => {
  it("wird gleichmäßig verteilt", () => {
    const t = family();
    const r = calcItem(item({ cat: "transport", options: [{ id: "o", label: "Mietwagen", price: { mode: "unit", currency: "EUR", unit: 35, qty: 11 } }] }), t);
    expect(r.net).toBe(385);
    expect(r.per.b).toBeCloseTo(96.25);
  });
  it("mit Kapazität und multiply werden genug Einheiten gebucht", () => {
    const t = family();
    const r = calcItem(item({ cat: "stay", options: [{ id: "o", label: "Zimmer", price: { mode: "unit", currency: "EUR", unit: 100, qty: 2, capacity: 3, multiply: true } }] }), t);
    expect(r.units).toBe(2);
    expect(r.net).toBe(400);
  });
  it("ohne multiply bleibt es bei einer Einheit", () => {
    const t = family();
    const r = calcItem(item({ cat: "stay", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 100, capacity: 2 } }] }), t);
    expect(r.units).toBe(1);
  });
});

describe("Optionen und Status", () => {
  const opts = [
    { id: "ew", label: "Eurowings", price: { mode: "person" as const, currency: "EUR", adult: 389 } },
    { id: "fr", label: "Ryanair", price: { mode: "person" as const, currency: "EUR", adult: 274 } }
  ];
  it("ohne Wahl zählt die günstigste Option", () => {
    const t = family();
    expect(activeOption(item({ status: "idea", options: opts }), t)!.id).toBe("fr");
  });
  it("die gewählte Option zählt", () => {
    const t = family();
    expect(calcItem(item({ status: "idea", chosen: "ew", options: opts }), t).net).toBe(4 * 389);
  });
  it("verworfene Posten zählen nicht, fest und offen werden getrennt", () => {
    const t = family();
    t.items = [
      item({ id: "1", status: "booked", options: [opts[0]], chosen: "ew" }),
      item({ id: "2", status: "idea", options: [opts[1]] }),
      item({ id: "3", status: "dropped", options: [opts[0]] }),
      item({ id: "4", cat: "misc", status: "paid", options: [{ id: "v", label: "", price: { mode: "unit", currency: "EUR", unit: 89 } }] })
    ];
    const T = totals(t);
    expect(T.total).toBe(4 * 389 + 4 * 274 + 89);
    expect(T.fixed).toBe(4 * 389 + 89);
    expect(T.open).toBe(4 * 274);
    expect(T.paid).toBe(89);
    expect(T.byCat.misc).toBe(89);
    expect(T.byHousehold.Klein).toBeCloseTo(T.total);
  });
  it("Anzahlungen zählen als bezahlt", () => {
    const t = family();
    t.items = [item({ status: "booked", payments: [{ amount: 400 }], options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 1628 } }] })];
    expect(totals(t).paid).toBe(400);
  });
});

describe("Zahleneingabe", () => {
  it("versteht deutsche und englische Schreibweise", () => {
    expect(parseNum("1.234,50 €")).toBe(1234.5);
    expect(parseNum("1.234")).toBe(1234);
    expect(parseNum("12.5")).toBe(12.5);
    expect(parseNum("")).toBeNaN();
  });
});
