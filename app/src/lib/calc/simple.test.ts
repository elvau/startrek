import { describe, expect, it } from "vitest";
import { householdShares, totals } from "./index";
import { DEFAULT_SETTINGS, isDetailed, type Trip } from "../model";

const trip = (): Trip => ({
  id: "t", name: "Kegeltour", place: "", country: "",
  travelers: [
    { id: "d", name: "Dani", age: 36, household: "Klein" },
    { id: "m", name: "Monika", age: 35, household: "Klein" },
    { id: "u", name: "Uwe", age: 50, household: "Schmitz" },
    { id: "k", name: "Karl", age: 60, household: "Berg", active: false }
  ],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS },
  simple: { flights: 600, stay: 900, transport: 90, misc: 60 }
});

describe("Einfacher Modus", () => {
  it("verteilt jeden Bereich gleich auf alle Aktiven", () => {
    const T = totals(trip());
    expect(T.total).toBe(1650);
    expect(T.active).toBe(3);
    expect(T.byPerson.d).toBeCloseTo(550);
    expect(T.byPerson.k).toBe(0);
    expect(T.byCat.stay).toBe(900);
    expect(T.byHousehold).toEqual({ Klein: 1100, Schmitz: 550 });
    expect(T.open).toBe(1650);
  });
  it("Betrag als Preis pro Person umgewandelt ergibt dieselbe Summe, auch mit Kind und bei Flügen", () => {
    const t = trip();
    t.travelers.push({ id: "c", name: "Kind", age: 8, household: "Klein" });
    t.detail = { flights: true };
    // wie setDetailed: 600 € auf 4 Aktive, Anreise zum Flughafen aus
    t.items = [{ id: "f", cat: "flights", name: "Flüge", status: "chosen", access: false, options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 150 } }] }];
    expect(totals(t).byCat.flights).toBe(600);
  });
  it("wer nicht dabei ist, zählt auch bei Posten nicht", () => {
    const t = trip();
    t.detail = { attractions: true };
    t.items = [{ id: "e", cat: "attractions", name: "Eintritt", status: "chosen", options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 10 } }] }];
    const T = totals(t);
    expect(T.byCat.attractions).toBe(30);
    expect(T.byPerson.k).toBe(0);
  });
  it("ein Bereich mit Posten ist ohne Angabe detailliert, der einfache Betrag zählt dann nicht", () => {
    const t = trip();
    t.items = [{ id: "f", cat: "flights", name: "Flug", status: "chosen", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 300 } }] }];
    expect(isDetailed(t, "flights")).toBe(true);
    expect(totals(t).byCat.flights).toBe(300);
  });
  it("auf einfach geschaltet zählen die Posten nicht, bleiben aber erhalten", () => {
    const t = trip();
    t.items = [{ id: "f", cat: "flights", name: "Flug", status: "chosen", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 300 } }] }];
    t.detail = { flights: false };
    const T = totals(t);
    expect(T.byCat.flights).toBe(600);
    expect(T.items.f.counts).toBe(false);
    expect(t.items).toHaveLength(1);
  });
  it("Abrechnung pro Familie zeigt einfache Beträge als eigene Zeile", () => {
    const [klein] = householdShares(trip());
    expect(klein.total).toBeCloseTo(1100);
    expect(klein.cats.find(c => c.cat === "flights")!.lines[0]).toMatchObject({ label: "Gesamtbetrag, gleich verteilt", v: 400, who: 2 });
  });
  it("ohne Aktive wird nichts verteilt", () => {
    const t = trip();
    t.travelers.forEach(x => (x.active = false));
    const T = totals(t);
    expect(T.active).toBe(0);
    expect(Object.values(T.byPerson).every(v => v === 0)).toBe(true);
  });
});
