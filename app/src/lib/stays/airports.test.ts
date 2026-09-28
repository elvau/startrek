import { describe, expect, it } from "vitest";
import world from "../../../../public/world.json";
import packs from "../../../../public/packs.json";
import places from "../../../../public/places/pa.json";
import { airportNights } from "./airports";
import type { GeoData } from "../geo/places";
import type { Trip } from "../model";

// echte Daten des Artefakts (public/ im Hauptordner)
const g = { world: world.countries, packs, places } as unknown as GeoData;

/** Familie Klein wohnt in Makarska (ca. 60 km vom Flughafen Split), Rückflug sehr früh, Landung spät */
const trip = (dep = "2027-07-29T06:30", arr = "2027-07-18T22:40", place = "Makarska"): Trip => ({
  id: "t", name: "Kroatien", place, country: "Kroatien", from: "2027-07-18", to: "2027-07-29",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }],
  items: [{ id: "f", cat: "flights", name: "Flug", status: "idea", options: [{ id: "o", label: "EW", price: { mode: "unit", currency: "EUR", unit: 900 },
    legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T20:40", arr }, { dir: "back", from: "SPU", to: "DUS", dep, arr: "2027-07-29T08:30" }] }] }],
  tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }
});

describe("Nächte am Flughafen", () => {
  it("sehr früher Rückflug weit weg: letzte Nacht am Flughafen, mit Orten in der Nähe", () => {
    const [first, last] = airportNights(trip(), g);
    expect(last).toMatchObject({ kind: "last", crit: true, from: "2027-07-28", to: "2027-07-29", ids: ["a", "b"] });
    expect(last.text).toMatch(/^Klein fliegen Do 29\.07\. 06:30 ab SPU, von Makarska ca\. 1:\d\d h: Abfahrt spätestens ca\. 0[23]:\d\d\. Letzte Nacht näher am Flughafen\?$/);
    expect(last.places.map(p => p.name)).toContain("Trogir");
    expect(last.suggest).toBe("Trogir");
    expect(first).toMatchObject({ kind: "first", from: "2027-07-18", to: "2027-07-19" });
    expect(first.text).toMatch(/^Klein landen So 18\.07\. 22:40 in SPU, bis Makarska noch ca\. 1:\d\d h\. Erste Nacht am Flughafen\?$/);
  });
  it("Rückflug mittags und Landung am Nachmittag: kein Vorschlag", () => {
    expect(airportNights(trip("2027-07-29T13:00", "2027-07-18T15:00"), g)).toEqual([]);
  });
  it("Ziel direkt am Flughafen (Trogir): auch früh kein Vorschlag", () => {
    expect(airportNights(trip("2027-07-29T06:30", "2027-07-18T15:00", "Trogir"), g)).toEqual([]);
  });
  it("schon eine Unterkunft für die letzte Nacht: kein Vorschlag mehr", () => {
    const t = trip("2027-07-29T06:30", "2027-07-18T15:00");
    t.items.push({ id: "s", cat: "stay", name: "Trogir", status: "idea", from: "2027-07-28", to: "2027-07-29", options: [] });
    expect(airportNights(t, g)).toEqual([]);
  });
});
