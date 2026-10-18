import { describe, expect, it } from "vitest";
import type { Trip } from "./model";
import { cheapestId, column, explain, sameTrip, shownRows } from "./compareView";

const trip = (id: string, stay: number, extra = 0): Trip => ({
  id, name: "Miami", place: "", country: "", from: "2027-06-10", to: "2027-06-14",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 42 }],
  items: [
    { id: "f", cat: "flights", name: "Flug", status: "idea", options: [{ id: "o", label: "LH", price: { mode: "person", currency: "EUR", adult: 300 + extra } }] },
    { id: "s", cat: "stay", name: "Hotel", status: "idea", options: [{ id: "o", label: "Mar", price: { mode: "unit", currency: "EUR", unit: stay } }] },
    { id: "v", cat: "misc", name: "Verpflegung", auto: "food", status: "idea", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 200 } }] },
    { id: "x", cat: "misc", name: "Versicherung", status: "idea", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 40 } }] }
  ],
  tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, detail: { flights: true, stay: true, misc: true }
});

describe("Vergleichsansicht (#430)", () => {
  it("Zeilen nach Kapiteln, Verpflegung als versteckte Kosten; Summe = Gesamtbetrag", () => {
    const c = column(trip("a", 800));
    expect(c.cells.flights).toEqual({ sum: 600, names: ["Flug"] });
    expect(c.cells.stay.sum).toBe(800);
    expect(c.cells.misc).toEqual({ sum: 40, names: ["Versicherung"] });
    expect(c.cells.hidden).toEqual({ sum: 200, names: ["Verpflegung"] });
    expect(Object.values(c.cells).reduce((s, x) => s + x.sum, 0)).toBe(c.total);
    expect(c.perPerson).toBe(c.total / 2);
  });

  it("nur Unterschiede, Erklärung gegenüber der günstigsten", () => {
    const juni = column(trip("j", 700)), juli = column(trip("l", 820, 260));
    const cols = [juni, juli];
    expect(cheapestId(cols)).toBe("j");
    expect(shownRows(cols, false)).toEqual(["flights", "stay", "misc", "hidden"]);
    expect(shownRows(cols, true)).toEqual(["flights", "stay"]);
    expect(explain(juni, juli)).toEqual({ total: 640, parts: [["flights", 520], ["stay", 120]] });
  });

  it("gleicher Ort: Varianten derselben Reise", () => {
    expect(sameTrip([{ place: "Miami", country: "USA" }, { place: "Miami", country: "USA" }])).toBe(true);
    expect(sameTrip([{ place: "Palma", country: "Spanien" }, { place: "Hamburg", country: "Deutschland" }])).toBe(false);
  });
});
