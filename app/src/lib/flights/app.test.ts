import { describe, expect, it } from "vitest";
import fixture from "./kiwi.fixture.json";
import { fromKiwi } from "./kiwi";
import { compareRow, covered, deadline, defaultFlyers, defaultQuery, fmtMin, nearestAirports, offerToOption, passengers, rate, takeOffer } from "./app";
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
    // flexibel: Reisezeitraum als Fenster, 11 Nächte → 9 bis 11
    expect(defaultQuery(trip())).toMatchObject({ latest: "2027-07-29", nightsMin: 9, nightsMax: 11 });
    expect(defaultQuery({ ...trip(), from: undefined, to: undefined })).toMatchObject({ latest: "", nightsMin: 7, nightsMax: 14 });
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
  it("wählt die 4 nächsten Flughäfen zum Wohnort", () => {
    const t = trip();
    t.households = { Klein: { geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" } } };
    expect(nearestAirports(t)[0]).toBe("DUS");
    expect(nearestAirports(t)).toHaveLength(4);
    expect(nearestAirports({ ...t, households: {} })).toEqual(["DUS", "NRN", "CGN", "DTM"]);
  });
  it("rechnet Anfahrt und „zuhause ca.“ je Treffer; Vergleich je Flughafen", () => {
    const t = trip();
    t.households = { Klein: { geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" }, mode: "car" } };
    const [a, b] = fromKiwi(fixture);
    const r = rate(t, a, "DUS", true);
    expect(r.access).toBeGreaterThan(0);
    expect(r.total).toBe(989 + r.access);
    expect(r.nights).toBe(11);
    // Landung 29.07. 16:25, dazu Heimfahrt und 45 min Gepäck
    expect(r.home).toBeGreaterThan(deadline("2027-07-29", "16:25"));
    expect(r.home).toBeLessThan(deadline("2027-07-29", "18:30"));
    expect(fmtMin(deadline("2027-07-29", "18:10"))).toBe("Do 29.07. 18:10");
    expect(rate(t, a, "DUS", false).total).toBe(989);
    const row = compareRow("DUS", [r, rate(t, b, "DUS", true)]);
    expect(row).toMatchObject({ code: "DUS", price: 989, count: 2, direct: r.total });
    expect(compareRow("CGN", [], "Kiwi antwortet mit 503")).toMatchObject({ count: 0, error: "Kiwi antwortet mit 503" });
  });
});

/** zwei Familien wie im Artefakt: Klein aus Düsseldorf, Hase aus München */
const two = (): Trip => ({
  ...trip(),
  travelers: [
    { id: "a", name: "Anna", age: 41, household: "Klein" }, { id: "c", name: "Mia", age: 8, household: "Klein" },
    { id: "h", name: "Hanna", age: 38, household: "Hase" }, { id: "i", name: "Ida", age: 5, household: "Hase" }, { id: "j", name: "Jan", age: 40, household: "Hase" }
  ],
  households: { Klein: { geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" }, mode: "car" }, Hase: { geo: { lat: 48.14, lon: 11.58, ort: "München" }, mode: "car" } }
});

describe("Flüge je Familie oder Person (wie im Artefakt)", () => {
  it("zählt nur, wer fliegt", () => {
    expect(passengers(two(), ["h", "i", "j"])).toEqual({ adults: 2, children: 1, infants: 0 });
    expect(defaultQuery(two(), "", ["h", "i", "j"])).toMatchObject({ from: "München", adults: 2, children: 1 });
  });
  it("Vorschlag: erste Familie ohne Flug; eine Familie oder alle versorgt: alle", () => {
    const t = two();
    expect(defaultFlyers(t)).toEqual(["a", "c"]);
    t.items.push({ id: "f1", cat: "flights", name: "Flug Klein", status: "idea", participants: ["a", "c"], options: [] });
    expect([...covered(t)]).toEqual(["a", "c"]);
    expect(defaultFlyers(t)).toEqual(["h", "i", "j"]);
    t.items.push({ id: "f2", cat: "flights", name: "Flug Hase", status: "idea", participants: ["h", "i", "j"], options: [] });
    expect(defaultFlyers(t)).toBeUndefined();
    expect(defaultFlyers(trip())).toBeUndefined();
  });
  it("Flughäfen: je Familie die nächsten zum Wohnort", () => {
    expect(nearestAirports(two(), 4, ["h", "i", "j"])[0]).toBe("MUC");
    const both = nearestAirports(two(), 4);
    expect(both).toContain("DUS");
    expect(both).toContain("MUC");
  });
  it("Anfahrt nur für die Familien, die fliegen", () => {
    const [o] = fromKiwi(fixture);
    const all = rate(two(), o, "DUS", true), klein = rate(two(), o, "DUS", true, ["a", "c"]);
    expect(klein.access).toBeGreaterThan(0);
    expect(klein.access).toBeLessThan(all.access);
  });
  it("Übernehmen: Posten nur für die Fliegenden, Name „Flug Klein“; weitere Treffer als Angebote dazu", () => {
    const t = two();
    const [a, b] = fromKiwi(fixture);
    const it = takeOffer(t, a, undefined, ["a", "c"]);
    expect(it).toMatchObject({ name: "Flug Klein", participants: ["a", "c"] });
    takeOffer(t, b, it.id, ["a", "c"]);
    expect(it.options).toHaveLength(2);
    expect(takeOffer(t, a, undefined, ["a", "c", "h", "i", "j"]).participants).toBeUndefined();
    expect(takeOffer(t, a, undefined, ["a", "h"]).name).toBe("Flug Düsseldorf – Split");
  });
});
