import { describe, expect, it } from "vitest";
import { guessAirports, HUBS } from "./origin";
import type { AirportData } from "../geo/locations";

const data = { cities: [], airports: [
  ["CGN", "Cologne Bonn", "Köln", "DE", 50.866, 7.143, "l", ""],
  ["DUS", "Düsseldorf", "Düsseldorf", "DE", 51.29, 6.767, "l", ""],
  ["FRA", "Frankfurt Main", "Frankfurt am Main", "DE", 50.027, 8.558, "l", ""],
  ["MAD", "Madrid", "Madrid", "ES", 40.472, -3.561, "l", ""]
] } as unknown as AirportData;

describe("Abflughäfen ohne Wohnort", () => {
  it("aus der Verbindung: die nächsten Flughäfen zum ungefähren Ort", () => {
    expect(guessAirports({ cc: "DE", lat: 50.9, lon: 7, city: "Köln" }, data, 4)).toEqual({ how: "ip", codes: ["CGN", "DUS", "FRA"], city: "Köln", cc: "DE" });
  });
  it("nur das Land (oder nichts in der Nähe): große Flughäfen des Landes", () => {
    expect(guessAirports({ cc: "AT" }, data, 3)).toEqual({ how: "country", codes: ["VIE", "SZG", "INN"], cc: "AT" });
    expect(guessAirports({ cc: "PT", lat: 38.7, lon: -9.1 }, data, 2)).toEqual({ how: "country", codes: ["LIS", "OPO"], cc: "PT" });
  });
  it("nichts bekannt oder unbekanntes Land: kein Vorschlag (Standardliste)", () => {
    expect(guessAirports(null, data)).toBeNull();
    expect(guessAirports({ cc: "ZZ" }, data)).toBeNull();
  });
  it("jedes Land hat Codes aus drei Buchstaben", () => {
    expect(Object.values(HUBS).flat().every(c => /^[A-Z]{3}$/.test(c))).toBe(true);
  });
});
