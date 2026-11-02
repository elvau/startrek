import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Item, type Trip } from "../model";
import { blocked, checkTrip, driveHours, publicWarn } from "./check";
import { tripToCatalog } from "./fromTrip";

const stay = (id: string, place: string, from: string, to: string, unit = 300, lat = 43.5, lon = 16.4): Item => ({ id, cat: "stay", name: `Unterkunft in ${place}`, status: "idea", from, to,
  options: [{ id: id + "o", label: "", price: { mode: "unit", currency: "EUR", unit }, loc: { lat, lon }, query: { place, checkin: from, checkout: to, adults: 2, childAges: [], rooms: 1 } }] });
const L = (dir: "out" | "back" | "via", from: string, to: string, dep: string, arr = dep) => ({ dir, from, to, dep, arr });
const PLACES: Record<string, { lat: number; lon: number; cc: string }> = { Split: { lat: 43.51, lon: 16.44, cc: "HR" }, Dubrovnik: { lat: 42.65, lon: 18.09, cc: "HR" }, Bergen: { lat: 60.39, lon: 5.32, cc: "NO" }, Tromsø: { lat: 69.65, lon: 18.96, cc: "NO" } };
const resolve = (n: string) => PLACES[n] || null;

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: "t", name: "Kroatien", place: "Split", country: "Kroatien", from: "2027-06-05", to: "2027-06-10", tiers: {}, settings: DEFAULT_SETTINGS,
    travelers: [{ id: "a", name: "Annabell", household: "Kleinert", age: 40 }, { id: "b", name: "Bernd", household: "Kleinert", age: 42 }],
    items: [
      { id: "f", cat: "flights", name: "Flug", status: "idea", options: [{ id: "fo", label: "", price: { mode: "unit", currency: "EUR", unit: 500 },
        legs: [L("out", "CGN", "SPU", "2027-06-05T10:00"), L("back", "DBV", "CGN", "2027-06-10T18:00")] }] },
      stay("s1", "Split", "2027-06-05", "2027-06-08"), stay("s2", "Dubrovnik", "2027-06-08", "2027-06-10", 200, 42.65, 18.09),
      { id: "r", cat: "transport", name: "Mietwagen", status: "idea", hint: "rental", options: [{ id: "ro", label: "", price: { mode: "unit", currency: "EUR", unit: 150 } }] }
    ],
    ...over
  };
}
const run = (t: Trip, title?: string) => { const e = tripToCatalog(t, { lang: "de", today: "2026-11-02", resolve }); if (title) e.title = title; return checkTrip(t, e); };
const codes = (fs: ReturnType<typeof run>) => fs.map(f => `${f.level}:${f.code}`);

describe("Plausibilitätscheck (#643)", () => {
  it("stimmige Rundreise: nichts zu melden", () => {
    expect(run(trip())).toEqual([]);
  });
  it("rot: Rückflug vor dem Hinflug", () => {
    const t = trip();
    t.items[0].options[0].legs = [L("out", "CGN", "SPU", "2027-06-10T10:00"), L("back", "DBV", "CGN", "2027-06-05T18:00")];
    expect(codes(run(t))).toContain("red:backBefore");
    expect(blocked(run(t))).toBe(true);
  });
  it("rot: zwei Unterkünfte am selben Abend für dieselben Leute; für verschiedene Familien erlaubt", () => {
    const t = trip();
    t.items.push(stay("s3", "Split", "2027-06-07", "2027-06-09"));
    expect(codes(run(t))).toContain("red:overlap");
    t.items[4].participants = ["b"]; t.items[1].participants = ["a"]; t.items[2].participants = ["a"];
    expect(codes(run(t))).not.toContain("red:overlap");
  });
  it("rot: Unterkunft außerhalb des Reisezeitraums, kein Ziel, Kontaktdaten im Titel", () => {
    const t = trip();
    t.items[2] = stay("s2", "Dubrovnik", "2027-06-08", "2027-06-12", 200, 42.65, 18.09);
    expect(codes(run(t))).toContain("red:stayOutside");
    expect(codes(run(trip(), "Infos unter www.example.com"))).toContain("red:contact");
    expect(codes(run(trip(), "Ruf an: 0176 1234567"))).toContain("red:contact");
    expect(codes(run(trip({ place: "", items: [], from: undefined, to: undefined })))).toEqual(expect.arrayContaining(["red:noNights"]));
  });
  it("gelb: Nacht ohne Unterkunft, mit Tag; Nachtflug und Camper zählen als Übernachtung", () => {
    const t = trip();
    t.items[2] = stay("s2", "Dubrovnik", "2027-06-09", "2027-06-10", 200, 42.65, 18.09);
    expect(run(t).find(f => f.code === "gap")).toMatchObject({ level: "yellow", day: 4 });
    expect(blocked(run(t))).toBe(false);
    expect(run({ ...t, camper: {} }).some(f => f.code === "gap")).toBe(false);
  });
  it("gelb: lange Fahrtage; bei Roadtrip und Camper höhere Grenze", () => {
    expect(driveHours(85 / 1.3)).toBeCloseTo(1, 1);
    // Bergen → Tromsø: rund 1.050 km Luftlinie, mit Auto unterwegs
    const nordkap = trip({ name: "Norwegen", place: "Bergen", country: "Norwegen", from: "2027-07-01", to: "2027-07-06",
      items: [stay("b", "Bergen", "2027-07-01", "2027-07-03", 300, 60.39, 5.32), stay("t", "Tromsø", "2027-07-03", "2027-07-06", 300, 69.65, 18.96),
        { id: "c", cat: "transport", name: "Auto", status: "idea", hint: "road:car", arrival: true, options: [{ id: "co", label: "", price: { mode: "unit", currency: "EUR", unit: 300 } }] }] });
    const fs = run(nordkap);
    expect(fs.find(f => f.code === "veryLong")).toMatchObject({ level: "yellow", v: { a: "Bergen", b: "Tromsø" } });
    expect(publicWarn(fs)).toEqual(["veryLong"]);
    // Split → Dubrovnik (rund 190 km): kein langer Fahrtag
    expect(run(trip()).some(f => f.code === "longDay" || f.code === "veryLong")).toBe(false);
  });
  it("gelb: weite Wege ohne Verkehrsmittel", () => {
    const t = trip();
    t.items = t.items.filter(i => i.id !== "r");
    t.items[0].options[0].legs = [L("out", "CGN", "SPU", "2027-06-05T10:00"), L("back", "DBV", "CGN", "2027-06-10T18:00")];
    expect(codes(run(t))).toContain("yellow:noMove");
  });
  it("gelb: Namen der Reisenden im Titel, ungewöhnlicher Preis; nicht öffentlich: Namen", () => {
    const fs = run(trip(), "Kroatien mit Annabell");
    expect(codes(fs)).toContain("yellow:names");
    expect(publicWarn(fs)).toEqual([]);
    const cheap = trip();
    cheap.items[1] = stay("s1", "Split", "2027-06-05", "2027-06-08", 10);
    expect(codes(run(cheap))).toContain("yellow:stayPrice");
  });
});
