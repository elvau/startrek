import { describe, expect, it } from "vitest";
import { AIRPORT_EARLY, COACH_MIN, bahnLink, fastest, flightIn, nearestAirport, coachCost, coachItem, groundPlan, homeOf, routeLink, tripDays } from "./ground";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import type { AirportData } from "./geo/locations";

const KOELN = { name: "Köln", lat: 50.94, lon: 6.96 }, BERLIN = { name: "Berlin", lat: 52.52, lon: 13.40 };
const MALLORCA = { name: "Palma", lat: 39.57, lon: 2.65 }, BONN = { name: "Bonn", lat: 50.737, lon: 7.098 };

function trip(n: number): Trip {
  return {
    id: "t", name: "", place: "Berlin", country: "Deutschland", from: "2026-10-15", to: "2026-10-17", tiers: {}, settings: DEFAULT_SETTINGS, items: [],
    travelers: Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i, household: i < 2 ? "Müller" : "Schmidt" })),
    households: { Müller: { geo: { ort: "Bonn", lat: 50.737, lon: 7.098 } }, Schmidt: { geo: { ort: "Köln", lat: 50.94, lon: 6.96 } } }
  };
}

describe("Bahn, Bus, Auto statt Flug", () => {
  it("nur bei nahen Zielen (30 bis 700 km Luftlinie)", () => {
    expect(groundPlan(KOELN, BERLIN, 4, 3)).not.toBeNull();
    expect(groundPlan(KOELN, MALLORCA, 4, 3)).toBeNull();
    expect(groundPlan(KOELN, BONN, 4, 3)).toBeNull();
  });
  it("Richtwerte pro Person hin und zurück: Bahn als Spanne, Auto geteilt", () => {
    const p = groundPlan(KOELN, BERLIN, 4, 3)!;
    expect(Math.round(p.km)).toBeGreaterThan(470);
    expect(p.modes.map(m => m.k)).toEqual(["train", "bus", "car"]);
    const train = p.modes[0], car = p.modes[2];
    expect(train.lo!).toBeLessThan(train.hi!);
    expect(train.lo!).toBeGreaterThanOrEqual(40);
    // ein Auto für 4: 2 × ~620 km × 0,30 € / 4
    expect(car.lo).toBe(car.hi);
    expect(car.lo!).toBeGreaterThan(80);
    expect(car.lo!).toBeLessThan(110);
    expect(p.coach).toBeUndefined();
  });
  it(`Reisebus ab ${COACH_MIN} Personen, Kleinbus bis 19, mehrere Busse ab 51`, () => {
    expect(groundPlan(KOELN, BERLIN, COACH_MIN - 1, 3)!.modes.some(m => m.k === "coach")).toBe(false);
    const p = groundPlan(KOELN, BERLIN, COACH_MIN, 3)!;
    expect(p.coach).toMatchObject({ size: "mini", buses: 1, stays: true });
    expect(p.modes.at(-1)!.k).toBe("coach");
    expect(coachCost(30, 600, 3).size).toBe("midi");
    expect(coachCost(80, 600, 3)).toMatchObject({ size: "full", buses: 2 });
  });
  it("Reisebus: bei kurzen Reisen bleibt er vor Ort, bei langen zwei Transfers", () => {
    const short = coachCost(20, 600, 3), long = coachCost(20, 600, 10);
    expect(short.stays).toBe(true);
    expect(short.total).toBe(Math.round(3 * 600 + 2 * 600 * 1.4 + 2 * 90));
    expect(long.stays).toBe(false);
    expect(long.total).toBe(Math.round(2 * (600 + 2 * 600 * 1.4)));
  });
  it("Posten Reisebus für die ganze Gruppe als Richtwert", () => {
    const it = coachItem(groundPlan(KOELN, BERLIN, 10, 3)!);
    expect(it).toMatchObject({ cat: "transport", options: [{ estimate: true, price: { mode: "unit", currency: "EUR", qty: 1 } }] });
    expect(it.options[0].price.unit).toBeGreaterThan(1000);
    expect(it.note).toContain("Berlin");
  });
  it("Wohnort: Haushalt mit den meisten Mitreisenden; Reisetage aus den Daten", () => {
    const t = trip(5);
    expect(homeOf(t)?.name).toBe("Köln");
    expect(tripDays(t)).toBe(3);
    expect(homeOf({ ...t, households: {} })).toBeNull();
    expect(tripDays({ ...t, from: undefined })).toBe(2);
  });
  it("Links mit Start, Ziel und Tag", () => {
    expect(bahnLink("Köln", "Berlin", "2026-10-15")).toBe("https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=K%C3%B6ln&zo=Berlin&hd=2026-10-15T08:00:00");
    expect(bahnLink("Köln", "Berlin")).not.toContain("hd=");
    expect(routeLink("Köln", "Berlin")).toContain("travelmode=transit");
  });
});

const AP: AirportData = { cities: [], airports: [
  ["CGN", "Köln/Bonn", "Köln", "DE", 50.866, 7.143, "l", ""], ["BER", "Berlin Brandenburg", "Berlin", "DE", 52.362, 13.502, "l", ""],
  ["SXF", "Schönefeld", "Berlin", "DE", 52.38, 13.52, "s", ""], ["MUC", "München", "München", "DE", 48.354, 11.775, "l", ""]
] };

describe("Reisezeit von Tür zu Tür", () => {
  it("Flug mit Anfahrt, 2 h vorher, Flug, Gepäck und Weg in die Stadt", () => {
    const f = { from: { code: "CGN", lat: 50.866, lon: 7.143 }, to: { code: "BER", lat: 52.362, lon: 13.502 }, minutes: 70 };
    const p = groundPlan(KOELN, BERLIN, 4, 3, { flight: f })!;
    const fl = p.modes[0];
    expect(fl).toMatchObject({ k: "flight", route: "CGN → BER", real: true });
    expect(fl.parts.map(x => x.k)).toEqual(["access", "early", "air", "land", "transfer"]);
    expect(fl.parts.find(x => x.k === "early")!.h).toBe(AIRPORT_EARLY);
    expect(fl.parts.find(x => x.k === "air")!.h).toBeCloseTo(70 / 60);
    expect(fl.hours).toBeCloseTo(fl.parts.reduce((a, x) => a + x.h, 0));
    // gut 4 h mit dem Flug, die Bahn mit Weg zum Bahnhof ähnlich, das Auto deutlich länger
    expect(fl.hours).toBeGreaterThan(4);
    const train = p.modes.find(m => m.k === "train")!, car = p.modes.find(m => m.k === "car")!;
    expect(train.parts.map(x => x.k)).toEqual(["station", "ride"]);
    expect(car.parts.map(x => x.k)).toEqual(["ride", "breaks"]);
    expect(car.hours).toBeGreaterThan(fl.hours);
    expect(fastest(p)).toBe(p.modes.reduce((a, b) => (b.hours < a.hours ? b : a)).k);
    // ohne Preis aus dem Posten: keine Spanne beim Flug
    expect(fl.lo).toBeUndefined();
  });
  it("nächster großer Flughafen am Ziel, nicht der eigene Abflughafen", () => {
    expect(nearestAirport(AP, BERLIN)?.code).toBe("BER");
    expect(nearestAirport(AP, KOELN, "CGN")).toBeNull();
  });
  it("Flug aus dem Posten der Reise, sonst geschätzt ab dem nächsten eigenen Flughafen", () => {
    const t = trip(4);
    const est = flightIn(t, KOELN, BERLIN, AP)!;
    expect(est.from.code).toBe("CGN");
    expect(est.to.code).toBe("BER");
    expect(est.minutes).toBeUndefined();
    t.items.push({ id: "f", cat: "flights", name: "Flug", status: "chosen", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 800 },
      legs: [{ dir: "out", from: "DUS", to: "BER", dep: "2026-10-15T07:00", arr: "2026-10-15T08:10", minutes: 70 }, { dir: "back", from: "BER", to: "DUS", dep: "2026-10-17T19:00", arr: "2026-10-17T20:10" }] }] });
    const real = flightIn(t, KOELN, BERLIN, AP)!;
    expect(real).toMatchObject({ from: { code: "DUS" }, to: { code: "BER" }, minutes: 70 });
    // 800 € für 4, dazu die Anfahrt zum Flughafen wie in der Kalkulation
    expect(real.pp!).toBeGreaterThan(200);
    expect(real.pp!).toBeLessThan(260);
    const fl = groundPlan(KOELN, BERLIN, 4, 3, { flight: real })!.modes[0];
    expect(fl.lo).toBe(fl.hi);
  });
});
