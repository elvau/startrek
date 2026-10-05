/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { whereFrom } from "./where";

describe("Ort aus der Verbindung", () => {
  it("Land, Ort, Koordinaten auf etwa 10 km gerundet", () => {
    expect(whereFrom({ country: "DE", city: "Köln", latitude: "50.9375", longitude: "6.9603" })).toEqual({ cc: "DE", lat: 50.9, lon: 7, city: "Köln" });
  });
  it("Tor, unbekannt und Nullpunkt fallen weg", () => {
    expect(whereFrom({ country: "T1", latitude: 0, longitude: 0 })).toEqual({});
    expect(whereFrom({ country: "XX" })).toEqual({});
    expect(whereFrom(undefined)).toEqual({});
  });
});
