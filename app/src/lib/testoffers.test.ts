import { describe, expect, it } from "vitest";
import { merge, PROVIDERS } from "./flights/search";
import { mergeStays, STAY_PROVIDERS } from "./stays/search";
import type { FlightOffer } from "./flights/types";
import type { StayOffer } from "./stays/types";

const leg = { from: "LHR", to: "JFK", dep: "2027-06-14T10:00:00", arr: "2027-06-14T13:00:00", minutes: 480, stops: 0, route: ["LHR", "JFK"], carriers: ["BA"], flights: ["BA117"] };
const fl = (id: string, price: number, test?: boolean): FlightOffer => ({ id, source: id, sourceName: id, price, currency: "EUR", out: leg, ...(test ? { test } : {}) });
const st = (id: string, total: number, test?: boolean): StayOffer => ({ id, source: id, sourceName: id, name: "Hotel Sol", total, currency: "EUR", lat: 39.57, lon: 2.65, ...(test ? { test } : {}) });

describe("Testangebote (Sandbox)", () => {
  it("Testzugang am Schlüssel erkannt", () => {
    const duffel = PROVIDERS.find(p => p.id === "duffel")!, lite = STAY_PROVIDERS.find(p => p.id === "liteapi")!;
    expect(duffel.test?.({ DUFFEL_TOKEN: "duffel_test_abc" })).toBe(true);
    expect(duffel.test?.({ DUFFEL_TOKEN: "duffel_live_abc" })).toBe(false);
    expect(lite.test?.({ LITEAPI_KEY: "sand_123" })).toBe(true);
    expect(lite.test?.({ LITEAPI_KEY: "prod_123" })).toBe(false);
  });
  it("gleicher Flug: echter Preis geht vor dem billigeren Testpreis", () => {
    expect(merge([[fl("kiwi", 500)], [fl("duffel", 300, true)]]).map(o => o.id)).toEqual(["kiwi"]);
    expect(merge([[fl("duffel", 300, true)], [fl("kiwi", 500)]]).map(o => o.id)).toEqual(["kiwi"]);
    expect(merge([[fl("a", 500)], [fl("b", 400)]]).map(o => o.id)).toEqual(["b"]);
  });
  it("gleiche Unterkunft: echter Preis geht vor dem Testpreis", () => {
    expect(mergeStays([[st("trivago", 700)], [st("liteapi", 300, true)]]).map(o => o.id)).toEqual(["trivago"]);
    expect(mergeStays([[st("liteapi", 300, true)], [st("trivago", 700)]]).map(o => o.id)).toEqual(["trivago"]);
  });
});
