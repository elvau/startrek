/* Lücken aus den Szenario-Tests (10/2026): Flughäfen außerhalb NRW, Testangebote, Bahn zum Flughafen */
import { describe, expect, it } from "vitest";
import { nearestAirports } from "./flights/app";
import { sortFlights } from "./flights/filter";
import { sortStays } from "./stays/sort";
import { accessFor, airportsOf, trainPP } from "./calc/travel";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import type { StayOffer } from "./stays/types";

const trip = (homes: Record<string, { lat: number; lon: number; ort: string }>): Trip => ({
  id: "t", name: "", place: "Prag", country: "Tschechien", tiers: {}, settings: DEFAULT_SETTINGS, items: [],
  travelers: Object.keys(homes).map((h, i) => ({ id: "p" + i, name: "P" + i, household: h })),
  households: Object.fromEntries(Object.entries(homes).map(([h, geo]) => [h, { plz: "x", geo }]))
});

describe("Abflughäfen in ganz Deutschland", () => {
  it("Hamburg, Berlin, Stuttgart: der eigene Flughafen zuerst", () => {
    expect(nearestAirports(trip({ Hamburg: { lat: 53.55, lon: 10.0, ort: "Hamburg" } }), 4)[0]).toBe("HAM");
    expect(nearestAirports(trip({ Berlin: { lat: 52.53, lon: 13.38, ort: "Berlin" } }), 4)[0]).toBe("BER");
    expect(nearestAirports(trip({ Stuttgart: { lat: 48.78, lon: 9.18, ort: "Stuttgart" } }), 4)[0]).toBe("STR");
  });
  it("ohne Wohnort wie bisher die NRW-Flughäfen", () => {
    const t = trip({}); t.travelers = [{ id: "a", name: "A", household: "X" }];
    expect(nearestAirports(t, 4)).toEqual(["DUS", "NRN", "CGN", "DTM"]);
  });
  it("Bahn zum Flughafen ohne festen Preis: aus der Entfernung", () => {
    expect(trainPP(20)).toBe(10);
    expect(trainPP(200)).toBe(60);
    expect(trainPP(2000)).toBe(160);
    const t = trip({ Hamburg: { lat: 53.55, lon: 10.0, ort: "Hamburg" } });
    t.households!.Hamburg.mode = "train";
    const ham = airportsOf(t).find(a => a.code === "HAM")!;
    expect(accessFor("Hamburg", ham, 2, 3, t).cost).toBe(2 * trainPP(accessFor("Hamburg", ham, 1, 3, t).km!));
  });
});

describe("Testangebote hinter die echten", () => {
  const s = (id: string, total: number, test?: boolean): StayOffer => ({ id, source: "x", sourceName: "X", name: id, total, currency: "EUR", ...(test ? { test } : {}) });
  it("Unterkünfte: auch wenn das Testangebot günstiger ist", () => {
    expect(sortStays([s("a", 300), s("t", 100, true), s("b", 200)], "price").map(o => o.id)).toEqual(["b", "a", "t"]);
  });
  it("Flüge ebenso", () => {
    const leg = { from: "DUS", to: "PMI", dep: "2027-05-01T08:00", arr: "2027-05-01T10:00", minutes: 120, stops: 0, route: ["DUS", "PMI"], carriers: ["X"], flights: ["X1"] };
    const f = (id: string, total: number, test?: boolean) => ({ id, source: "x", sourceName: "X", price: total, total, currency: "EUR", out: leg, origin: "DUS", accessHours: 0, ...(test ? { test } : {}) });
    expect(sortFlights([f("a", 300), f("t", 100, true), f("b", 200)], "price").map(o => o.id)).toEqual(["b", "a", "t"]);
  });
});
