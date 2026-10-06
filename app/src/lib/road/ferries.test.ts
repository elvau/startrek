import { describe, expect, it } from "vitest";
import { FERRIES, areaOf, ferriesBetween } from "./ferries";
import { etappen, roadTripCost, withFerries, type Stop } from "./trip";

const cc = (p: [number, number]) => (p[1] < 1.8 && p[0] > 50 ? "GB" : "DE");
const stop = (name: string, lat: number, lon: number, kind: Stop["kind"] = "station", date?: string): Stop => ({ name, lat, lon, kind, ...(date ? { date } : {}) });

describe("Fähren (#202)", () => {
  it("Gebiete über Wasser: Inseln nach Lage, Großbritannien und Irland nach Land", () => {
    expect(areaOf({ lat: 40.92, lon: 9.52 })).toBe("sardinia");
    expect(areaOf({ lat: 42.70, lon: 9.45 })).toBe("corsica");
    expect(areaOf({ lat: 39.56, lon: 2.63 })).toBe("balearics");
    expect(areaOf({ lat: 38.20, lon: 15.56 })).toBe("sicily");
    // Villa San Giovanni (Festland) und Livorno sind kein Gebiet über Wasser
    expect(areaOf({ lat: 38.22, lon: 15.63 })).toBeUndefined();
    expect(areaOf({ lat: 43.56, lon: 10.30 })).toBeUndefined();
    expect(areaOf({ lat: 51.5, lon: -0.1 }, "GB")).toBe("gb");
  });
  it("Fähre nach Sardinien: Livorno → Olbia vorn (kurzer Weg zum Hafen, mit Preis), andere als Wahl", () => {
    const l = ferriesBetween({ lat: 45.44, lon: 10.99 }, { lat: 40.92, lon: 9.52 }, () => "IT");
    expect(l[0].ferry.id).toBe("livorno-olbia");
    expect(l[0].from.name).toBe("Livorno");
    expect(l.map(p => p.ferry.id)).toContain("genova-olbia");
    // zurück: Häfen vertauscht
    expect(ferriesBetween({ lat: 40.92, lon: 9.52 }, { lat: 45.44, lon: 10.99 }, () => "IT")[0]).toMatchObject({ from: { name: "Olbia" }, to: { name: "Livorno" } });
    // gleiche Seite: keine Fähre
    expect(ferriesBetween({ lat: 45.44, lon: 10.99 }, { lat: 43.77, lon: 11.25 }, () => "IT")).toEqual([]);
  });
  it("Rundreise mit Fähre: Häfen als Halte, Überfahrt ohne Kilometer, Kosten je Fahrzeug, Person und Kabine (nur auf Wunsch)", () => {
    const base = [stop("Düsseldorf", 51.23, 6.78, "home"), stop("Verona", 45.44, 10.99, "station", "2027-07-12"), stop("Olbia", 40.92, 9.52, "station", "2027-07-15"), stop("Düsseldorf", 51.23, 6.78, "home", "2027-07-22")];
    const { stops, ferries } = withFerries(base, () => "IT");
    // Olbia ist Station und Hafen zugleich: kein eigener Halt; zurück über Genua (näher an Düsseldorf)
    expect(stops.map(s => s.name)).toEqual(["Düsseldorf", "Verona", "Livorno", "Olbia", "Genua", "Düsseldorf"]);
    expect(ferries.size).toBe(2);
    const et = etappen(stops, stops.slice(1).map(() => null), () => "IT", "2027-07-22", ferries);
    const f = et.filter(e => e.ferry);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ km: 0, min: 9 * 60, date: "2027-07-15" });
    const c = roadTripCost(et, 0.3, () => 1);
    const car = c.extras.filter(x => x.kind === "ferry");
    expect(car).toHaveLength(2);
    expect(car[0].amount).toBe(FERRIES.find(x => x.id === "livorno-olbia")!.car);
    expect(c.extras.find(x => x.kind === "ferryPerson")).toMatchObject({ basis: "person", amount: 70, freeUpTo: 3 });
    expect(c.extras.find(x => x.kind === "cabin")).toMatchObject({ amount: 140, off: true });
    // Sprit nur für die Straße
    expect(c.km).toBe(et.filter(e => !e.ferry).reduce((s, e) => s + e.km, 0));
  });
  it("gewählte Verbindung gilt, Pflichtkabine als Paket ohne Personen und Kabine", () => {
    const base = [stop("Düsseldorf", 51.23, 6.78, "home"), stop("Olbia", 40.92, 9.52, "station", "2027-07-15"), stop("Düsseldorf", 51.23, 6.78, "home", "2027-07-22")];
    const { ferries } = withFerries(base, () => "IT", { "Düsseldorf>Olbia": "genova-olbia" });
    expect([...ferries.values()][0].pick.ferry.id).toBe("genova-olbia");
    const uk = withFerries([stop("Kiel", 54.32, 10.14, "home"), stop("York", 53.96, -1.08, "station", "2027-07-15"), stop("Kiel", 54.32, 10.14, "home", "2027-07-22")], cc);
    expect([...uk.ferries.values()].map(f => f.pick.to.cc)).toContain("GB");
  });
});
