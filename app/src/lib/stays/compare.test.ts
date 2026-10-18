import { describe, expect, it } from "vitest";
import world from "../../../../public/world.json";
import packs from "../../../../public/packs.json";
import places from "../../../../public/places/pa.json";
import { distances, effectOf, flightFacts, letter, nearestTo, parseSpot, refPoints, spreadKm, townsOf, NEAR_KM } from "./compare";
import { findCity, type GeoData } from "../geo/places";
import type { Item, Option, Trip } from "../model";

const g = { world: world.countries, packs, places } as unknown as GeoData;
const split = findCity(g, "Split", "HR")!;
const opt = (id: string, unit: number, lat?: number, lon?: number, board?: "breakfast"): Option => ({
  id, label: `Hotel ${id}`, price: { mode: "unit", currency: "EUR", unit, basis: "stay" }, stay: board ? { board } : {}, ...(lat != null ? { loc: { lat, lon } } : {})
});
const stay = (options: Option[]): Item => ({ id: "s", cat: "stay", name: "Unterkunft", status: "idea", from: "2027-07-18", to: "2027-07-22", options, chosen: options[0].id });
const trip = (items: Item[]): Trip => ({
  id: "t", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-22",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 38 }],
  items, tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, detail: { misc: true, stay: true }
});

describe("Angebote vergleichen (#438)", () => {
  it("Buchstaben A, B, C wie auf der Karte", () => {
    expect([0, 1, 2].map(letter)).toEqual(["A", "B", "C"]);
  });

  it("Bezugspunkte: Zentrum des Orts und Erlebnisse mit Ort, nicht die Unterkünfte selbst", () => {
    const ev: Item = { id: "e", cat: "attractions", name: "Ultra Europe", status: "idea", options: [{ id: "eo", label: "Ultra", price: { mode: "person", currency: "EUR" }, loc: { lat: 43.52, lon: 16.47 } }] };
    const s = stay([opt("a", 800, split.lat, split.lon)]);
    const r = refPoints(trip([s, ev]), g, s);
    expect(r.map(x => x.kind)).toEqual(["center", "event"]);
    expect(r[0]).toMatchObject({ id: "center", name: "Split" });
    expect(r[1]).toMatchObject({ id: "item:e", name: "Ultra Europe" });
  });

  it("ohne Ort der Reise: Zentrum des Orts, für den gesucht wurde", () => {
    const o = { ...opt("a", 800, split.lat, split.lon), query: { place: "Split", country: "Kroatien", checkin: "2027-07-18", checkout: "2027-07-22", adults: 2, childAges: [], rooms: 1 } };
    const s = stay([o]);
    const t = { ...trip([s]), place: "", country: "" };
    expect(refPoints(t, g, s)[0]).toMatchObject({ id: "center", name: "Split" });
    expect(refPoints(t, g)).toEqual([]);
  });

  it("eigene Bezugspunkte (#441): in der Reise gespeichert, nach dem Zentrum", () => {
    const s = stay([opt("a", 800, split.lat, split.lon)]);
    const t = { ...trip([s]), refs: [{ id: "x", name: "Partylocation", lat: 43.5, lon: 16.44 }] };
    expect(refPoints(t, g, s).map(r => [r.id, r.kind, r.name])).toEqual([["center", "center", "Split"], ["own:x", "custom", "Partylocation"]]);
  });

  it("Lage eines eigenen Punkts: Koordinaten, Google-Maps-Link oder Ort", () => {
    expect(parseSpot("39.5113, 2.7441", g)).toEqual({ lat: 39.5113, lon: 2.7441 });
    expect(parseSpot("https://www.google.com/maps/place/Megapark/@39.5108,2.7452,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d39.5109!4d2.7449", g)).toEqual({ lat: 39.5109, lon: 2.7449 });
    expect(parseSpot("https://maps.google.com/?q=43.508,16.44", g)).toEqual({ lat: 43.508, lon: 16.44 });
    expect(parseSpot("Trogir", g, "HR")).toMatchObject({ name: "Trogir" });
    expect(parseSpot("0.0, 0.0", g)).toBeNull();
    expect(parseSpot("gibt es nicht", g, "HR")).toBeNull();
  });

  it("Entfernungen je Angebot, nächstes je Bezugspunkt; ohne Koordinaten null", () => {
    const os = [opt("a", 800, split.lat + 0.05, split.lon), opt("b", 900, split.lat, split.lon + 0.002), opt("c", 700)];
    const refs = refPoints(trip([stay(os)]), g);
    const d = distances(os, refs);
    expect(d.a!.center).toBeGreaterThan(5);
    expect(d.b!.center).toBeLessThan(0.5);
    expect(d.c).toBeNull();
    expect(nearestTo(d, refs)).toEqual({ center: "b" });
    // nur ein Angebot mit Lage: kein „am nächsten“
    expect(nearestTo(distances(os.slice(1), refs), refs)).toEqual({});
  });

  it("Abstand der Angebote: nah beieinander oder weit auseinander", () => {
    expect(spreadKm([opt("a", 1, 43.5, 16.4), opt("b", 1, 43.55, 16.45)])).toBeLessThan(NEAR_KM);
    expect(spreadKm([opt("a", 1, 43.5, 16.4), opt("b", 1, 43.0, 17.2)])).toBeGreaterThan(NEAR_KM);
    expect(spreadKm([opt("a", 1, 43.5, 16.4), opt("b", 1)])).toBe(0);
  });

  it("weit auseinander: je Angebot der nächste Ort mit Entfernung (Mallorca)", () => {
    const os = [opt("a", 1, 39.512, 2.751), opt("b", 1, 39.707, 3.457), opt("c", 1)];
    const t = { ...trip([stay(os)]), place: "Palma", country: "Spanien" };
    const w = townsOf(os, t, g);
    expect(w.a).toMatchObject({ name: "Playa de Palma" });
    expect(w.a!.km).toBeLessThan(3);
    expect(w.b?.name).toBeTruthy();
    expect(w.c).toBeNull();
  });

  it("ganze Reise je Angebot: Verpflegung folgt der Verpflegung der Unterkunft, die Reise bleibt unverändert", () => {
    const t = trip([stay([opt("a", 800, undefined, undefined, "breakfast"), opt("b", 800)])]);
    t.food = { on: true, style: "mix" };
    const before = JSON.stringify(t);
    const a = effectOf(t, "s", "a", g), b = effectOf(t, "s", "b", g);
    expect(a.people).toBe(2);
    // gleicher Zimmerpreis, ohne Frühstück mehr Verpflegung
    expect(b.food).toBeGreaterThan(a.food);
    expect(b.total - a.total).toBeCloseTo(b.food - a.food, 5);
    expect(a.perPerson).toBeCloseTo(a.total / 2, 5);
    expect(JSON.stringify(t)).toBe(before);
  });
});

describe("Flüge und Erlebnisse vergleichen (#441)", () => {
  const leg = (dir: "out" | "back", dep: string, arr: string, stops = 0, minutes = 150) => ({ dir, from: "DUS", to: "PMI", dep, arr, stops, minutes });
  it("Flug: Hin und Rück, meiste Umstiege, Flugzeit, Gepäck", () => {
    const o: Option = { id: "f", label: "EW", price: { mode: "unit", currency: "EUR", unit: 400 }, legs: [leg("out", "2027-06-10T06:00", "2027-06-10T08:30"), leg("back", "2027-06-14T20:00", "2027-06-14T23:40", 1, 220)], baggage: { personal: 2, cabin: 2, checked: 0 } };
    expect(flightFacts(o)).toMatchObject({ out: { dep: "2027-06-10T06:00" }, back: { stops: 1 }, stops: 1, minutes: 370, bag: "cabin" });
    expect(flightFacts({ ...o, baggage: undefined }).bag).toBeUndefined();
  });
  it("Erlebnisse: Unterkünfte als Bezug (wie weit vom Hotel)", () => {
    const s = stay([opt("a", 800, split.lat, split.lon)]);
    const ev: Item = { id: "e", cat: "attractions", name: "Bootstour", status: "idea", options: [{ id: "eo", label: "Boot", price: { mode: "person", currency: "EUR" }, loc: { lat: 43.52, lon: 16.47 } }] };
    expect(refPoints(trip([s, ev]), g, ev, true).map(r => r.kind)).toEqual(["center", "stay"]);
    expect(refPoints(trip([s, ev]), g, ev).map(r => r.kind)).toEqual(["center"]);
  });
});
