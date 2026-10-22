import { describe, expect, it } from "vitest";
import { householdShares, totals } from "./index";
import { DEFAULT_SETTINGS, type Trip } from "../model";

const trip = (): Trip => ({
  id: "t", name: "T", place: "", country: "",
  travelers: [
    { id: "a", name: "Anna", age: 40, household: "Klein" },
    { id: "m", name: "Mia", age: 8, household: "Klein" },
    { id: "o", name: "Oma", age: 70, household: "Oma" }
  ],
  tiers: {}, settings: { ...DEFAULT_SETTINGS },
  items: [
    { id: "zoo", cat: "attractions", name: "Zoo", status: "idea", options: [{ id: "z", label: "", price: { mode: "person", currency: "EUR", adult: 20, child: 10 } }] },
    { id: "auto", cat: "transport", name: "Mietwagen", status: "booked", participants: ["a", "m"], options: [{ id: "c", label: "", price: { mode: "unit", currency: "EUR", unit: 300 } }] },
    { id: "weg", cat: "misc", name: "Verworfen", status: "dropped", options: [{ id: "x", label: "", price: { mode: "unit", currency: "EUR", unit: 999 } }] }
  ]
});

describe("Abrechnung pro Haushalt", () => {
  it("zeigt je Haushalt Summe, fest und offen, nach Kategorie und Posten", () => {
    const t = trip();
    const [klein, oma] = householdShares(t);
    expect(klein.name).toBe("Klein");
    expect(klein.total).toBe(330);
    expect(klein.fixed).toBe(300);
    expect(klein.open).toBe(30);
    expect(klein.cats.map(c => c.cat)).toEqual(["transport", "attractions"]);
    expect(klein.cats[1].lines[0]).toMatchObject({ v: 30, who: 2, detail: "1 × Erwachsen 20 € · 1 × Kind 10 €" });
    expect(klein.members.map(m => m.v)).toEqual([170, 160]);
    expect(oma.total).toBe(20);
    expect(oma.cats).toHaveLength(1);
  });
  it("Summe aller Haushalte ergibt die Gesamtsumme", () => {
    const t = trip();
    const T = totals(t);
    expect(householdShares(t, T).reduce((a, h) => a + h.total, 0)).toBeCloseTo(T.total);
  });
});

describe("Abrechnung pro Haushalt: kleine Posten", () => {
  it("Anteile unter 50 Cent stehen in einer Sammelzeile, Familienkarten ergeben die Summe", () => {
    const t = trip();
    t.travelers = ["a", "b", "c", "d", "e", "f", "g"].map(id => ({ id, name: id, age: 30, household: id === "a" || id === "b" ? "AB" : id === "c" || id === "d" ? "CD" : id }));
    t.items = [{ id: "k", cat: "misc", name: "Kleinkram", status: "booked", options: [{ id: "x", label: "", price: { mode: "unit", currency: "EUR", unit: 1 } }] }];
    const T = totals(t);
    const hs = householdShares(t, T);
    for (const h of hs) expect(h.total).toBeCloseTo(T.byHousehold[h.name]);
    expect(hs.reduce((a, h) => a + h.total, 0)).toBeCloseTo(T.total);
    expect(hs.find(h => h.name === "e")!.cats[0].lines[0].key).toBe("small:misc");
  });
});
