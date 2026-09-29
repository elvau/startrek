import { describe, expect, it } from "vitest";
import world from "../../../../public/world.json";
import packs from "../../../../public/packs.json";
import places from "../../../../public/places/pa.json";
import { airportOf, ccOf, cityForAirport, findCity, placesNear, searchParts, type GeoData } from "./places";

// echte Daten des Artefakts (public/ im Hauptordner)
const g = { world: world.countries, packs, places } as unknown as GeoData;

describe("Orte und Flughäfen", () => {
  it("findet Flughäfen aus Paketen und Weltdaten", () => {
    expect(airportOf(g, "SPU")).toMatchObject({ code: "SPU", cc: "HR", name: "Split" });
    expect(airportOf(g, "zag")?.cc).toBe("HR");
    expect(airportOf(g, "XXX")).toBeNull();
  });
  it("Land aus deutschem oder englischem Namen", () => {
    expect(ccOf(g, "Kroatien")).toBe("HR");
    expect(ccOf(g, "Croatia")).toBe("HR");
    expect(ccOf(g, "")).toBeNull();
  });
  it("Land auch aus Namen in den anderen Sprachen der App", () => {
    expect(["Croacia", "Croatie", "Chorwacja", "Хорватия"].map(n => ccOf(g, n))).toEqual(["HR", "HR", "HR", "HR"]);
    expect(ccOf(g, "Atlantis")).toBeNull();
  });
  it("Orte am Flughafen Split, nächste zuerst, höchstens 40 km", () => {
    const l = placesNear(g, airportOf(g, "SPU")!, 5);
    expect(l.length).toBeGreaterThan(2);
    expect(l.every(p => p.km <= 40)).toBe(true);
    expect(l.map(p => p.km)).toEqual([...l.map(p => p.km)].sort((a, b) => a - b));
    expect(l.map(p => p.name)).toContain("Trogir");
  });
  it("Ort für einen Flughafen wie im Artefakt (größere Orte zählen näher)", () => {
    expect(["Split", "Trogir"]).toContain(cityForAirport(g, airportOf(g, "SPU")!)?.name);
  });
  it("Suchbegriff auf Englisch: Ort und Land", () => {
    expect(findCity(g, "Plitvice", "HR")?.name).toBe("Plitvicer Seen");
    expect(searchParts(g, "Plitvicer Seen", "HR")).toEqual({ place: "Plitvice Lakes", country: "Croatia" });
    expect(searchParts(g, "Trogir", "HR")).toEqual({ place: "Trogir", country: "Croatia" });
    expect(searchParts(g, "Irgendwo, Spain", "HR")).toEqual({ place: "Irgendwo", country: "Spain" });
  });
});
