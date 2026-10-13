import { describe, expect, it } from "vitest";
import type { FlightLeg } from "../model";
import { tourHead } from "./flightHead";

const leg = (dir: FlightLeg["dir"], from: string, to: string, carrier?: string): FlightLeg => ({ dir, from, to, dep: "2027-07-18T06:10", arr: "2027-07-18T08:10", carrier });
describe("tourHead", () => {
  it("Rundreise: ganze Route und alle Airlines", () => {
    const h = tourHead([leg("back", "BUD", "DUS", "Lufthansa"), leg("out", "DUS", "BCN", "Ryanair"), leg("via", "BCN", "BUD", "Wizz Air")]);
    expect(h).toEqual({ chain: ["DUS", "BCN", "BUD", "DUS"], carriers: ["Ryanair", "Wizz Air", "Lufthansa"], count: 3 });
  });
  it("gleiche Airline nur einmal", () => {
    expect(tourHead([leg("out", "A", "B", "X"), leg("via", "B", "C", "X")])?.carriers).toEqual(["X"]);
  });
  it("einfache Flüge: null", () => {
    expect(tourHead([leg("out", "DUS", "SPU"), leg("back", "SPU", "DUS")])).toBeNull();
    expect(tourHead(undefined)).toBeNull();
  });
});
