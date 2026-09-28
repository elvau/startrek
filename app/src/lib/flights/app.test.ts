import { describe, expect, it } from "vitest";
import fixture from "./kiwi.fixture.json";
import { fromKiwi } from "./kiwi";
import { defaultQuery, offerToOption, passengers, takeOffer } from "./app";
import { totals } from "../calc";
import { DEFAULT_SETTINGS, type Trip } from "../model";

const trip = (): Trip => ({
  id: "t", name: "", place: "Split", country: "", from: "2027-07-18", to: "2027-07-29",
  travelers: [
    { id: "a", name: "Anna", age: 41, household: "Klein" },
    { id: "b", name: "Jonas", household: "Klein" },
    { id: "c", name: "Mia", age: 8, household: "Klein" },
    { id: "d", name: "Ben", age: 1, household: "Klein" },
    { id: "e", name: "Kind", household: "Klein", kind: "infant" },
    { id: "f", name: "Opa", household: "Klein", active: false }
  ],
  households: { Klein: { geo: { lat: 0, lon: 0, ort: "Düsseldorf" } } },
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
});

describe("Flugsuche in der App", () => {
  it("zählt Personen: Baby nur mit Alter unter 2, Kleinkind ohne Alter mit Sitz, Inaktive nicht", () => {
    expect(passengers(trip())).toEqual({ adults: 2, children: 2, infants: 1 });
  });
  it("schlägt Wohnort, Ziel und Daten der Reise vor", () => {
    expect(defaultQuery(trip())).toMatchObject({ from: "Düsseldorf", to: "Split", depart: "2027-07-18", ret: "2027-07-29" });
    expect(defaultQuery(trip(), "DUS").from).toBe("DUS");
  });
  it("macht aus einem Treffer ein Angebot mit Quelle, Link und Hin- und Rückflug", () => {
    const o = offerToOption(fromKiwi(fixture)[0]);
    expect(o).toMatchObject({ label: "Eurowings ab DUS, direkt", price: { mode: "unit", unit: 989 }, source: { name: "Kiwi.com", url: "https://kiwi.com/u/uqukjx" } });
    expect(o.legs).toEqual([
      { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:05", carrier: "Eurowings", stops: 0 },
      { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T14:25", arr: "2027-07-29T16:25", carrier: "Eurowings", stops: 0 }
    ]);
  });
  it("erster Treffer legt einen Posten an, weitere kommen als Angebote dazu; die Summe stimmt", () => {
    const t = trip();
    t.detail = { flights: true };
    const [a, b] = fromKiwi(fixture);
    const item = takeOffer(t, a);
    takeOffer(t, b, item.id);
    expect(t.items).toHaveLength(1);
    expect(item).toMatchObject({ cat: "flights", name: "Flug Düsseldorf – Split" });
    expect(item.options).toHaveLength(2);
    // ohne Wahl zählt das günstigste Angebot, dazu die Anreise zum Flughafen (hier ohne Wohnort-Entfernung 0)
    expect(totals(t).items[item.id].net).toBeGreaterThanOrEqual(989);
  });
});
