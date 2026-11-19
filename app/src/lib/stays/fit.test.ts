import { describe, expect, it } from "vitest";
import world from "../../../../public/world.json";
import packs from "../../../../public/packs.json";
import placesHr from "../../../../public/places/pa.json";
import placesEs from "../../../../public/places/pe.json";
import { airportNights } from "./airports";
import { offTarget } from "./fit";
import type { GeoData } from "../geo/places";
import type { Item, Trip } from "../model";

const g = { world: world.countries, packs, places: { ...placesHr, ...placesEs } } as unknown as GeoData;
const flight: Item = { id: "f", cat: "flights", name: "Flug", status: "idea", options: [{ id: "o", label: "EW", price: { mode: "unit", currency: "EUR", unit: 900 },
  legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T20:40", arr: "2027-07-18T22:40" }, { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T06:30", arr: "2027-07-29T08:30" }] }] };
const stay = (id: string, lat: number, lon: number, place: string): Item => ({ id, cat: "stay", name: `Hotel ${place}`, status: "idea", from: "2027-07-18", to: "2027-07-29",
  options: [{ id: `${id}o`, label: "Hotel", price: { mode: "total", currency: "EUR", total: 1200 }, loc: { lat, lon }, query: { place, checkin: "2027-07-18", checkout: "2027-07-29", adults: 2, childAges: [], rooms: 1 } }] });
const trip = (place: string, country: string, items: Item[]): Trip => ({
  id: "t", name: "Sommer", place, country, from: "2027-07-18", to: "2027-07-29",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }],
  items, tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }
});

describe("passt nicht zum Reiseziel (#551)", () => {
  it("Variante Makarska → Alcúdia: Flug nach Split und Hotel in Makarska passen nicht, keine Nacht am Flughafen", () => {
    const t = trip("Alcúdia", "Spanien", [flight, stay("s", 43.296, 17.017, "Makarska")]);
    const off = offTarget(t, g);
    expect(off.map(o => [o.id, o.kind, o.where])).toEqual([["f", "flight", "SPU"], ["s", "stay", "Makarska"]]);
    expect(off[0].km).toBeGreaterThan(1000);
    expect(airportNights(t, g)).toEqual([]);
  });
  it("Ziel Makarska: alles passt, Flughafen-Nacht wie bisher", () => {
    const t = trip("Makarska", "Kroatien", [flight, stay("s", 43.296, 17.017, "Makarska")]);
    expect(offTarget(t, g)).toEqual([]);
    expect(airportNights(t, g).length).toBeGreaterThan(0);
  });
  it("Rundreise: eine Unterkunft am Ziel reicht, weitere Stationen zählen nicht; unbekanntes Ziel: keine Prüfung", () => {
    const t = trip("Split", "Kroatien", [stay("s1", 43.508, 16.44, "Split"), stay("s2", 45.815, 15.982, "Zagreb"), stay("s3", 45.33, 14.44, "Rijeka")]);
    expect(offTarget(t, g)).toEqual([]);
    expect(offTarget(trip("Irgendwo", "", [flight]), g)).toEqual([]);
    // verworfene Posten zählen nicht
    expect(offTarget(trip("Alcúdia", "Spanien", [{ ...flight, status: "dropped" }]), g)).toEqual([]);
  });
});
