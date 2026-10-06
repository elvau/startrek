import { describe, expect, it } from "vitest";
import { CAMPER_FERRY, CAMPING, CAMPING_DEFAULT, HEAVY, STELLPLATZ, HEIGHT_FACTOR, campNight } from "./camper";
import { FERRIES } from "./ferries";
import { etappen, roadTripCost, withFerries, type Etappe, type Stop } from "./trip";
import { VIGNETTES } from "../fees";

const stop = (name: string, lat: number, lon: number, kind: Stop["kind"] = "station", date?: string): Stop => ({ name, lat, lon, kind, ...(date ? { date } : {}) });
const leg = (cc: Record<string, number>, date: string): Etappe =>
  ({ from: stop("A", 0, 0), to: stop("B", 0, 0), date, km: Object.values(cc).reduce((a, b) => a + b, 0), min: 60, path: [], cc, est: true });

describe("Camper (#203)", () => {
  it("Campingplatz für die Gruppe: 2 inklusive, jede weitere Person extra; Stellplatz pauschal", () => {
    expect(campNight("site", "IT", 2)).toBe(44);
    // 4 Personen: ACSI-Wert (2 Erwachsene + 2 Kinder)
    expect(campNight("site", "IT", 4)).toBe(Math.round(CAMPING.IT.acsi));
    expect(campNight("site", "IT", 1)).toBe(44);
    expect(campNight("pitch", "IT", 4)).toBe(CAMPING.IT.pitch);
    expect(campNight("site", "XX", 2)).toBe(Math.round(CAMPING_DEFAULT.acsi * 0.75));
    expect(campNight("pitch", "HR", 2)).toBe(STELLPLATZ);
  });
  it("Camper über 2 m: Maut nach Strecke mit Höhenfaktor, Vignetten unverändert", () => {
    const et = [leg({ DE: 500, AT: 100, IT: 400 }, "2027-07-12"), leg({ IT: 300, FR: 200 }, "2027-07-15")];
    const car = roadTripCost(et, 0.3, () => 1);
    const cp = roadTripCost(et, 0.45, () => 1, "", { camper: true });
    const amt = (c: typeof car, id: string) => c.extras.find(x => x.id === id)?.amount;
    expect(amt(cp, "road:toll:IT")).toBeCloseTo(amt(car, "road:toll:IT")! * HEIGHT_FACTOR.IT, 1);
    expect(amt(cp, "road:toll:FR")).toBeCloseTo(amt(car, "road:toll:FR")! * HEIGHT_FACTOR.FR, 1);
    expect(amt(cp, "road:toll:DE")).toBe(amt(car, "road:toll:DE"));
    expect(amt(cp, "road:vignette:AT")).toBe(amt(car, "road:vignette:AT"));
    expect(cp.fuel).toBe(Math.round(1500 * 0.45));
  });
  it("über 3,5 t: GO-Box in Österreich nach km, PSVA in der Schweiz je Tag statt Vignette", () => {
    const et = [leg({ DE: 300, AT: 200 }, "2027-07-12"), leg({ AT: 50, CH: 150 }, "2027-07-14"), leg({ CH: 250, DE: 100 }, "2027-07-18")];
    const c = roadTripCost(et, 0.45, (cur) => (cur === "CHF" ? 0.95 : 1), "", { camper: true, heavy: true });
    const ids = c.extras.map(x => x.id);
    expect(ids).not.toContain("road:vignette:AT");
    expect(ids).not.toContain("road:vignette:CH");
    expect(c.extras.find(x => x.id === "road:gobox:AT")).toMatchObject({ kind: "toll", amount: 250 * HEAVY.AT.perKm, pay: "onsite", est: true });
    // 2 Tage in der Schweiz → Mindestbetrag 25 CHF
    expect(c.extras.find(x => x.id === "road:psva:CH")!.amount).toBeCloseTo(HEAVY.CH.min / 0.95, 2);
    // ohne Camper bleibt „heavy“ wirkungslos
    const car = roadTripCost(et, 0.3, () => 1, "", { heavy: true }).extras.map(x => x.id);
    expect(car).toContain("road:vignette:AT");
    expect(VIGNETTES.some(v => v.cc === "CH")).toBe(true);
    expect(car).toContain("road:vignette:CH");
  });
  it("Fähre: Camper-Tarif statt Pkw", () => {
    const base = [stop("Düsseldorf", 51.23, 6.78, "home"), stop("Verona", 45.44, 10.99, "station", "2027-07-12"), stop("Olbia", 40.92, 9.52, "station", "2027-07-15"), stop("Düsseldorf", 51.23, 6.78, "home", "2027-07-22")];
    const { stops, ferries } = withFerries(base, () => "IT");
    const et = etappen(stops, stops.slice(1).map(() => null), () => "IT", "2027-07-22", ferries);
    const f = FERRIES.find(x => x.id === "livorno-olbia")!;
    const c = roadTripCost(et, 0.45, () => 1, "", { camper: true });
    expect(c.extras.filter(x => x.kind === "ferry")[0].amount).toBeCloseTo(f.camper ?? f.car! * CAMPER_FERRY, 2);
  });
});
