import { describe, expect, it } from "vitest";
import { calcItem, presences } from "./index";
import { accessFor, nightsList, roadKm } from "./travel";
import { DEFAULT_SETTINGS, type Item, type Trip } from "../model";
import { DEFAULT_AIRPORTS } from "../airports";

const DUS = DEFAULT_AIRPORTS.find(a => a.code === "DUS")!;

/** Zwei Familien; Familie Groß kommt zwei Tage später */
function trip(): Trip {
  return {
    id: "t", name: "T", place: "", country: "",
    travelers: [
      { id: "a", name: "Anna", age: 40, household: "Klein" },
      { id: "b", name: "Ben", age: 8, household: "Klein" },
      { id: "c", name: "Carl", age: 45, household: "Groß" },
      { id: "d", name: "Dora", age: 44, household: "Groß" }
    ],
    households: {
      Klein: { plz: "40210", geo: { lat: 51.2217, lon: 6.7762, ort: "Düsseldorf" }, mode: "car", cars: 1 },
      Groß: { mode: "train", arrive: "2027-07-20", depart: "2027-07-25" }
    },
    tiers: {}, settings: { ...DEFAULT_SETTINGS },
    items: [
      {
        id: "f", cat: "flights", name: "Flug", status: "chosen", participants: ["a", "b"],
        options: [{
          id: "o", label: "EW", price: { mode: "person", currency: "EUR", adult: 100 },
          legs: [
            { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:25" },
            { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-25T09:15", arr: "2027-07-25T11:35" }
          ]
        }]
      }
    ]
  };
}
const stay = (x: Partial<Item>): Item => ({ id: "s", cat: "stay", name: "Villa", status: "booked", from: "2027-07-18", to: "2027-07-25", options: [], ...x });

describe("Nächte und Anwesenheit", () => {
  it("Nächte von Anreise bis vor Abreise", () => {
    expect(nightsList("2027-07-18", "2027-07-21")).toEqual(["2027-07-18", "2027-07-19", "2027-07-20"]);
    expect(nightsList("2027-07-21", "2027-07-18")).toEqual([]);
  });
  it("aus dem Flug oder aus eigenen Daten", () => {
    const P = presences(trip());
    expect(P.a).toEqual({ a: "2027-07-18", d: "2027-07-25", src: "flight" });
    expect(P.c).toEqual({ a: "2027-07-20", d: "2027-07-25", src: "manual" });
  });
});

describe("Unterkunft mit Zeitraum", () => {
  it("Pauschale pro Nacht wird je Nacht auf die Anwesenden verteilt", () => {
    const t = trip();
    // 7 Nächte à 140 €; Nächte 18. und 19. nur Klein (2 Pers.), ab 20. alle 4
    const r = calcItem(stay({ options: [{ id: "v", label: "", price: { mode: "unit", currency: "EUR", unit: 140 } }] }), t);
    expect(r.net).toBe(980);
    expect(r.stay!.nights.length).toBe(7);
    expect(r.stay!.w).toEqual({ a: 7, b: 7, c: 5, d: 5 });
    expect(r.per.a).toBeCloseTo(2 * 70 + 5 * 35);
    expect(r.per.c).toBeCloseTo(5 * 35);
    expect(r.per.a + r.per.b + r.per.c + r.per.d).toBeCloseTo(980);
  });
  it("Preis pro Person gilt pro anwesender Nacht", () => {
    const t = trip();
    const r = calcItem(stay({ options: [{ id: "v", label: "", price: { mode: "person", currency: "EUR", adult: 30, child: 10 } }] }), t);
    expect(r.per).toEqual({ a: 210, b: 70, c: 150, d: 150 });
  });
  it("Preis für den ganzen Aufenthalt", () => {
    const t = trip();
    expect(calcItem(stay({ options: [{ id: "v", label: "", price: { mode: "unit", currency: "EUR", unit: 900, basis: "stay" } }] }), t).net).toBe(900);
  });
  it("mehr Gäste als Plätze wird erkannt, mit multiply werden Einheiten ergänzt", () => {
    const t = trip();
    const over = calcItem(stay({ options: [{ id: "v", label: "", price: { mode: "unit", currency: "EUR", unit: 100, capacity: 3 } }] }), t);
    expect(over.stay!.maxOcc).toBe(4);
    expect(over.stay!.over).toBe(true);
    const multi = calcItem(stay({ options: [{ id: "v", label: "", price: { mode: "unit", currency: "EUR", unit: 100, capacity: 3, multiply: true } }] }), t);
    expect(multi.units).toBe(2);
    expect(multi.net).toBe(1400);
  });
});

describe("Anreise zum Flughafen", () => {
  it("Straßenkilometer aus der Luftlinie mal 1,3", () => {
    const km = roadKm({ lat: 51.2217, lon: 6.7762 }, DUS)!;
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(12);
  });
  it("Auto: hin und zurück plus Parken für die Reisetage", () => {
    const t = trip();
    const a = accessFor("Klein", DUS, 2, 8, t);
    const km = roadKm(t.households!.Klein.geo, DUS)!;
    expect(a.cost).toBeCloseTo(2 * km * 0.3 + 8 * 12);
  });
  it("Bahn: Preis pro Person", () => {
    expect(accessFor("Groß", DUS, 2, 8, trip()).cost).toBe(20);
  });
  it("ohne PLZ wird Bahn angenommen", () => {
    const t = trip(); delete t.households!.Klein.geo;
    expect(accessFor("Klein", DUS, 2, 8, t).info).toContain("PLZ fehlt");
  });
  it("wer mitfährt, zahlt keine Anreise", () => {
    const t = trip(); t.households!.Groß = { mode: "with", link: "Klein" };
    expect(accessFor("Groß", DUS, 2, 8, t).cost).toBe(0);
  });
  it("wird beim Flug eingerechnet, Tage vom Hinflug bis zum Rückflug", () => {
    const t = trip();
    const r = calcItem(t.items[0], t);
    const km = roadKm(t.households!.Klein.geo, DUS)!;
    const acc = 2 * km * 0.3 + 8 * 12;
    expect(r.access!.cost).toBeCloseTo(acc);
    expect(r.net).toBeCloseTo(200 + acc);
    expect(r.per.a).toBeCloseTo(100 + acc / 2);
  });
  it("lässt sich abschalten", () => {
    const t = trip(); t.items[0].access = false;
    expect(calcItem(t.items[0], t).net).toBe(200);
  });
});
