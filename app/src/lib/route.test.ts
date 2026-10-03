import { describe, expect, it } from "vitest";
import { arc, buildRoute, mapView, outline, project } from "./route";
import { itinerary } from "./itinerary";
import { DEFAULT_SETTINGS, type Trip } from "./model";

const AP: Record<string, { lat: number; lon: number }> = { CGN: { lat: 50.87, lon: 7.14 }, SPU: { lat: 43.54, lon: 16.3 }, DBV: { lat: 42.56, lon: 18.27 } };
const PL: Record<string, { lat: number; lon: number }> = { Split: { lat: 43.51, lon: 16.44 }, Dubrovnik: { lat: 42.65, lon: 18.09 } };
const r = { airport: (c: string) => AP[c] || null, place: (n: string) => PL[n] || null };
const L = (dir: "out" | "back", from: string, to: string, dep: string) => ({ dir, from, to, dep, arr: dep });
const stay = (id: string, place: string, from: string, to: string, loc?: { lat: number; lon: number }) => ({ id, cat: "stay" as const, name: place, status: "idea" as const, from, to,
  options: [{ id: id + "o", label: place, price: { mode: "unit" as const, currency: "EUR", unit: 1 }, query: { place, checkin: from, checkout: to, adults: 2, childAges: [], rooms: 1 }, ...(loc ? { loc } : {}) }] });
const trip = (): Trip => ({ id: "t", name: "", place: "Split", country: "Kroatien", from: "2027-06-05", to: "2027-06-10", tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [{ id: "a", name: "A", household: "K" }],
  items: [
    { id: "f", cat: "flights", name: "Flug", status: "chosen", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 1 }, legs: [L("out", "CGN", "SPU", "2027-06-05T14:30"), L("back", "DBV", "CGN", "2027-06-10T18:00")] }] },
    // zweite Familie mit demselben Flug: nicht doppelt
    { id: "f2", cat: "flights", name: "Flug 2", status: "idea", options: [{ id: "o2", label: "", price: { mode: "unit", currency: "EUR", unit: 1 }, legs: [L("out", "CGN", "SPU", "2027-06-05T14:30")] }] },
    stay("s1", "Split", "2027-06-05", "2027-06-08", { lat: 43.508, lon: 16.44 }), stay("s2", "Dubrovnik", "2027-06-08", "2027-06-10")
  ] });

describe("Reiseroute", () => {
  it("Wohnort → Flug → Stationen in Reihenfolge → Rückflug → Wohnort", () => {
    const t = trip();
    const R = buildRoute(t, itinerary(t), r, { name: "Köln", lat: 50.94, lon: 6.96 });
    expect(R.points.map(p => `${p.kind}:${p.name}`)).toEqual(["home:Köln", "airport:CGN", "airport:SPU", "station:Split", "station:Dubrovnik", "airport:DBV", "airport:CGN", "home:Köln"]);
    expect(R.segs.map(s => s.mode)).toEqual(["ground", "flight", "ground", "ground", "ground", "flight", "ground"]);
    expect(R.points[3]).toMatchObject({ nights: 3, day: 1, lat: 43.508 });
    expect(R.points[4]).toMatchObject({ nights: 2, day: 4 });
  });
  it("ohne Flug und ohne Wohnort: nur die Stationen", () => {
    const t = trip(); t.items = t.items.filter(i => i.cat === "stay");
    const R = buildRoute(t, itinerary(t), r);
    expect(R.points.map(p => p.name)).toEqual(["Split", "Dubrovnik"]);
    expect(R.segs).toHaveLength(1);
  });
  it("Bogen und Projektion", () => {
    const a = arc({ lat: 0, lon: 0 }, { lat: 0, lon: 10 }, 4);
    expect(a[0]).toEqual([0, 0]); expect(a[4]).toEqual([10, 0]); expect(a[2][1]).not.toBe(0);
    const pr = project([{ lat: 50, lon: 7 }, { lat: 43, lon: 16 }], 120, 60);
    const [x1, y1] = pr({ lat: 50, lon: 7 }), [x2, y2] = pr({ lat: 43, lon: 16 });
    expect(x1).toBeLessThan(x2); expect(y1).toBeLessThan(y2);
    for (const v of [x1, x2]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(120); }
  });
  it("Kartenausschnitt passt zur Projektion", () => {
    const pts = [{ lat: 43.51, lon: 16.44 }, { lat: 42.65, lon: 18.09 }];
    const v = mapView(pts, 640, 180, 14)!, pr = project(pts, 640, 180, 14);
    // Mitte des Bildes = Mitte der Karte
    const [cx, cy] = pr({ lon: v.center[0], lat: v.center[1] });
    expect(cx).toBeCloseTo(320, 3); expect(cy).toBeCloseTo(90, 3);
    // Maßstab: bei Zoom z hat die Welt 512·2^z Pixel
    const [x1] = pr({ lat: 0, lon: 0 }), [x2] = pr({ lat: 0, lon: 1 });
    expect(x2 - x1).toBeCloseTo((512 * 2 ** v.zoom) / 360, 3);
    expect(mapView([pts[0]], 160, 72)!.zoom).toBe(11);
  });
  it("Mini-Bild: ganze Route samt Flugbogen im Rechteck", () => {
    const t = trip();
    const R = buildRoute(t, itinerary(t), r, { name: "Köln", lat: 50.94, lon: 6.96 });
    const shape = outline(R), pr = project(shape, 280, 80, 10);
    for (const p of shape) { const [x, y] = pr(p); expect(x).toBeGreaterThanOrEqual(9.9); expect(x).toBeLessThanOrEqual(270.1); expect(y).toBeGreaterThanOrEqual(9.9); expect(y).toBeLessThanOrEqual(70.1); }
  });
});
