import { describe, expect, it } from "vitest";
import { countryKm, estimateLeg, etappen, isRoadTrip, nearestCountry, roadStops, roadTripCost, vignetteCount, withPauses, type Stop } from "./trip";
import type { Route } from "../route";
import type { Trip } from "../model";

// grobe Städte: Deutschland, Österreich, Italien, Slowenien
const cities: [string, number, number][] = [["DE", 51.23, 6.78], ["DE", 48.14, 11.58], ["DE", 47.6, 10.9], ["AT", 47.27, 11.39], ["AT", 48.21, 16.37], ["AT", 46.62, 14.31],
  ["IT", 45.44, 10.99], ["IT", 45.44, 12.33], ["IT", 46.5, 11.35], ["SI", 46.05, 14.51]];
const cc = nearestCountry(cities);
const stop = (name: string, lat: number, lon: number, kind: Stop["kind"] = "station", date?: string): Stop => ({ name, lat, lon, kind, ...(date ? { date } : {}) });

describe("Roadtrip (#201)", () => {
  it("Auto-Reise: kein Flug und Auto-Posten oder mehrere Stationen", () => {
    const t = (items: Trip["items"]) => ({ items } as Trip);
    expect(isRoadTrip(t([]), 2)).toBe(true);
    expect(isRoadTrip(t([]), 1)).toBe(false);
    expect(isRoadTrip(t([{ id: "c", cat: "transport", hint: "road:car", status: "idea", name: "", options: [] }]), 1)).toBe(true);
    expect(isRoadTrip(t([{ id: "f", cat: "flights", status: "idea", name: "", options: [] }]), 3)).toBe(false);
  });
  it("Halte aus der Route nur ohne Flug", () => {
    const r: Route = { points: [{ name: "Düsseldorf", lat: 51.23, lon: 6.78, kind: "home" }, { name: "Gardasee", lat: 45.6, lon: 10.7, kind: "station", date: "2027-07-12" }, { name: "Düsseldorf", lat: 51.23, lon: 6.78, kind: "home" }], segs: [{ a: 0, b: 1, mode: "ground" }, { a: 1, b: 2, mode: "ground" }] };
    expect(roadStops(r).map(s => s.name)).toEqual(["Düsseldorf", "Gardasee", "Düsseldorf"]);
    expect(roadStops({ ...r, segs: [{ a: 0, b: 1, mode: "flight" }] })).toEqual([]);
  });
  it("Schätzung: Luftlinie × 1,3 bei 85 km/h, Pausen je 2 Stunden", () => {
    const l = estimateLeg([51.23, 6.78], [48.14, 11.58]);
    expect(l.km).toBeGreaterThan(600);
    expect(l.km).toBeLessThan(650);
    expect(l.min).toBe(Math.round((l.km / 85) * 60));
    expect(withPauses(100)).toBe(100);
    expect(withPauses(270)).toBe(300);
  });
  it("Länder auf der Strecke: Kilometer je Land aus dem Verlauf", () => {
    const l = estimateLeg([48.14, 11.58], [45.44, 10.99]);
    const m = countryKm(l.path, l.km, cc);
    expect(Object.keys(m).sort()).toEqual(["AT", "DE", "IT"]);
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBeCloseTo(l.km, -1);
  });
  it("Vignette nur so oft wie nötig: Fahrtage im Land innerhalb der Gültigkeit zählen einmal", () => {
    expect(vignetteCount(["2027-07-12", "2027-07-15"], 10)).toBe(1);
    expect(vignetteCount(["2027-07-12", "2027-07-26"], 10)).toBe(2);
    expect(vignetteCount(["2027-07-12", "2027-07-26"], 365)).toBe(1);
  });
  it("Rundreise: Sprit für alle km, Vignette AT einmal, SI einmal, Maut IT nach km im Land", () => {
    const stops = [stop("Düsseldorf", 51.23, 6.78, "home"), stop("Gardasee", 45.6, 10.7, "station", "2027-07-12"), stop("Venedig", 45.44, 12.33, "station", "2027-07-15"),
      stop("Ljubljana", 46.05, 14.51, "station", "2027-07-18"), stop("Wien", 48.21, 16.37, "station", "2027-07-20"), stop("Düsseldorf", 51.23, 6.78, "home", "2027-07-23")];
    const et = etappen(stops, stops.slice(1).map(() => null), cc);
    expect(et).toHaveLength(5);
    expect(et.every(e => e.est)).toBe(true);
    expect(et[0].date).toBe("2027-07-12");
    const c = roadTripCost(et, 0.3, () => 1);
    const total = et.reduce((s, e) => s + e.km, 0);
    expect(c.fuel).toBe(Math.round(total * 0.3));
    const ids = c.extras.map(x => x.id);
    expect(ids.filter(i => i === "road:vignette:AT")).toHaveLength(1);
    expect(ids).toContain("road:vignette:SI");
    const it = c.extras.find(x => x.id === "road:toll:IT")!;
    const itKm = et.reduce((s, e) => s + (e.cc.IT || 0), 0);
    expect(it.amount).toBeCloseTo((itKm * 7.5) / 100, 1);
    // AT: Fahrtage 20. und 23.07. liegen in einer 10-Tages-Vignette
    expect(c.extras.find(x => x.id === "road:vignette:AT")!.amount).toBeCloseTo(12.8);
    // hin über Österreich am 12.07., zurück am 23.07.: zwei Vignetten
    const two = etappen([stop("München", 48.14, 11.58, "home"), stop("Wien", 48.21, 16.37, "station", "2027-07-12"), stop("München", 48.14, 11.58, "home", "2027-07-23")], [null, null], cc);
    expect(roadTripCost(two, 0.3, () => 1).extras.find(x => x.id === "road:vignette:AT")).toMatchObject({ amount: 25.6, source: expect.stringMatching(/^2 ×/) });
  });
  it("echte Strecke vom Routen-Dienst geht vor", () => {
    const stops = [stop("A", 51.23, 6.78, "home"), stop("B", 48.14, 11.58, "station", "2027-07-12")];
    const et = etappen(stops, [{ km: 612, min: 380, path: [[51.23, 6.78], [48.14, 11.58]] }], cc);
    expect(et[0]).toMatchObject({ km: 612, min: 380, est: false });
  });
});
