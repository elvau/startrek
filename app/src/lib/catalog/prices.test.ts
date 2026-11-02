import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { arrivalFor, flightKey, FLIGHT_PP } from "./arrival";
import { addPoints, applyStats, arrivalPoint, arrivalTable, guide, median, parsePoints, withoutOutliers, type PricePoint } from "./prices";
import { pointsOf } from "./pricecheck";
import type { CatalogEntry } from "./types";

const P = (c: PricePoint["c"], k: string, pp: number, m = 6, d = "2026-10-01"): PricePoint => ({ c, k, pp, m, n: 2, d });
const entry: CatalogEntry = {
  v: 1, id: "kat1", source: "user", lang: "de", title: "Istrien", kind: "round", group: { adults: 2, children: 0, infants: 0 }, months: [6], nights: 8,
  stops: [{ place: "Poreč", lat: 45.23, lon: 13.6, nights: 5 }, { place: "Plitvice", lat: 44.88, lon: 15.62, nights: 3 }],
  costs: [{ cat: "stay", pp: 310, range: [250, 400], place: "Poreč", nights: 5 }, { cat: "stay", pp: 150, place: "Plitvice", nights: 3 }, { cat: "transport", pp: 95 }],
  tours: [{ name: "Bootstour", pp: 35 }], days: [], stand: "2026-08"
};

describe("Preispunkte (#652 Teil 2)", () => {
  it("Mitte und Ausreißer (1,5-facher Quartilsabstand, erst ab 4 Werten)", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(withoutOutliers([100, 110, 120, 130, 900])).toEqual([100, 110, 120, 130]);
    expect(withoutOutliers([100, 900, 110])).toEqual([100, 900, 110]);
  });
  it("Saison: mit genug Punkten aus derselben Saison nur diese, sonst alle", () => {
    const pts = [P("stay", "A", 400, 7), P("stay", "A", 420, 8), P("stay", "A", 440, 7), P("stay", "A", 200, 5), P("stay", "A", 220, 10, "2026-11-01")];
    expect(guide(pts, 7)).toEqual({ pp: 420, n: 3, stand: "2026-10" });
    expect(guide(pts, 5)?.n).toBe(5);
    expect(guide(pts)?.stand).toBe("2026-11");
    expect(guide([])).toBeNull();
  });
  it("Eintrag: Unterkunft je Ort und Touren nach Name, Stand und Zahl der Prüfungen; ohne Punkte unverändert", () => {
    const e = applyStats(entry, [P("stay", "poreč", 400, 6, "2026-11-01"), P("stay", "Poreč", 380), P("tour", "Bootstour", 45), P("stay", "Rovinj", 999)]);
    expect(e.costs[0]).toEqual({ cat: "stay", pp: 390, place: "Poreč", nights: 5 });
    expect(e.costs[1].pp).toBe(150);
    expect(e.tours[0].pp).toBe(45);
    expect([e.stand, e.checked]).toEqual(["2026-11", 2]);
    expect(applyStats(entry, [])).toBe(entry);
    expect(applyStats(entry, [P("stay", "Rovinj", 1)])).toBe(entry);
  });
  it("Anreise-Tabelle: erst ab 3 Punkten je Zeile, verändert den Richtwert nach Entfernung", () => {
    const t = arrivalTable([P("arrival", "2000", 300), P("arrival", "2000", 320), P("arrival", "2000", 340), P("arrival", "4500", 500), P("stay", "A", 1)]);
    expect(t).toEqual({ "2000": 320 });
    const home = { lat: 52.52, lon: 13.4 };
    const base = arrivalFor(entry, home, 6)!, upd = arrivalFor(entry, home, 6, { flights: t })!;
    expect(base.pp).toBe(FLIGHT_PP[0].pp);
    expect(upd.pp).toBe(320);
    expect(flightKey(1000)).toBe("2000");
    expect(flightKey(99999)).toBe("Infinity");
    expect(arrivalPoint(260, 8, 30)).toBe(230);
    expect(arrivalPoint(200, 6, 30)).toBe(230);
  });
  it("Meldung prüfen und Punkte begrenzen (12 Monate, höchstens 80)", () => {
    const r = parsePoints({ entry: "idea:gardasee", points: [{ c: "stay", k: " Poreč ", pp: 450.4, m: 6, n: 2, d: "1999-01-01", extra: "x" }] }, "2026-11-02");
    expect(r).toEqual({ entry: "idea:gardasee", points: [{ c: "stay", k: "Poreč", pp: 450, m: 6, n: 2, d: "2026-11-02" }] });
    expect(parsePoints({ entry: "a b", points: [] })).toBe("Eintrag fehlt");
    expect(parsePoints({ entry: "kat1abcd", points: [{ c: "stay", k: "x@y.de", pp: 1, m: 1, n: 1 }] })).toBe("Preispunkt ungültig");
    const old = [P("stay", "A", 1, 6, "2025-10-01"), P("stay", "A", 2, 6, "2025-12-01")];
    expect(addPoints(old, [P("stay", "A", 3, 6, "2026-11-02")], "2026-11-02").map(p => p.pp)).toEqual([2, 3]);
    expect(addPoints(Array.from({ length: 90 }, (_, i) => P("stay", "A", i, 6, "2026-10-01")), [], "2026-11-02")).toHaveLength(80);
  });
  it("aus der Prüfung: Unterkunft nach Ort, Tour nach Name, Flug als Anreise nach Entfernung; nichts Persönliches", () => {
    const trip: Trip = {
      id: "t", name: "Istrien mit Anna", place: "Poreč", country: "Kroatien", from: "2027-06-05", to: "2027-06-13", tiers: {}, settings: DEFAULT_SETTINGS,
      travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 41 }],
      items: [
        { id: "f", cat: "flights", name: "Flug ab Köln", status: "idea", participants: ["a", "b"], options: [] },
        { id: "s", cat: "stay", name: "Unterkunft", status: "idea", options: [] },
        { id: "x", cat: "attractions", name: "Bootstour", status: "idea", options: [] }
      ],
      catalog: { id: "kat1", stand: "2026-11", rel: { nights: 8, dest: { place: "Poreč", lat: 45.23, lon: 13.6 }, stays: { s: { off: 0, n: 5, place: "Poreč" } }, flights: { f: { name: "Köln", lat: 50.94, lon: 6.96 } }, tours: { x: { place: "Poreč" } } } }
    };
    const pts = pointsOf(trip, [{ item: "f", state: "ok", pp: 210 }, { item: "s", state: "ok", pp: 450 }, { item: "x", state: "ok", pp: 45 }, { item: "x", state: "none" }]);
    expect(pts).toEqual([{ c: "arrival", k: "2000", pp: 240, m: 6, n: 2 }, { c: "stay", k: "Poreč", pp: 450, m: 6, n: 2 }, { c: "tour", k: "Bootstour", pp: 45, m: 6, n: 2 }]);
    expect(JSON.stringify(pts)).not.toMatch(/Anna|Klein|Köln/);
    expect(pointsOf({ ...trip, from: undefined }, [{ item: "s", state: "ok", pp: 1 }])).toEqual([]);
  });
});
