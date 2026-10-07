import { describe, expect, it } from "vitest";
import { transferItem, transferLegs, transferPlan, vehicleFor, vehicleText } from "./transfer";

const PMI = { code: "PMI", lat: 39.551, lon: 2.736 }, PALMA = { name: "Palma", lat: 39.57, lon: 2.65 };

describe("Flughafentransfer", () => {
  it("Fahrzeug nach Gruppengröße mit Gepäck", () => {
    expect(vehicleFor(2)).toEqual({ vehicle: "taxi", count: 1 });
    expect(vehicleFor(4)).toEqual({ vehicle: "van", count: 1 });
    expect(vehicleFor(15)).toEqual({ vehicle: "minibus", count: 1 });
    expect(vehicleFor(17)).toEqual({ vehicle: "coach", count: 1 });
    expect(vehicleFor(120)).toEqual({ vehicle: "coach", count: 3 });
  });
  it("Preis je Fahrt aus Grundpreis und Straßen-km, Preisniveau des Landes", () => {
    const p = transferPlan(PMI, PALMA, 2);
    expect(p).toMatchObject({ ap: "PMI", to: "Palma", vehicle: "taxi", count: 1 });
    expect(p.km).toBeGreaterThan(8);
    expect(p.km).toBeLessThan(12);
    expect(p.perRide).toBe(Math.round(25 + 1.6 * p.km));
    expect(transferPlan(PMI, PALMA, 2, 0.8).perRide).toBeLessThan(p.perRide);
    // Mindeststrecke 3 km
    expect(transferPlan(PMI, { name: "Flughafen", lat: 39.551, lon: 2.736 }, 2).km).toBe(3);
    expect(transferPlan(PMI, PALMA, 15).perRide).toBeGreaterThan(p.perRide);
  });
  it("Posten: zwei Fahrten als Richtwert für die Gruppe", () => {
    const p = transferPlan(PMI, PALMA, 6);
    const it = transferItem(p);
    expect(it).toMatchObject({ cat: "transport", options: [{ estimate: true, price: { mode: "unit", unit: p.perRide, qty: 2 } }] });
    expect(it.note).toContain("PMI");
    expect(vehicleText({ vehicle: "coach", count: 2 })).toMatch(/^2 × /);
  });
  it("Rundreise: ein Transfer je Unterkunft, nächster Flughafen der Reise, sonst der nächste große", () => {
    const LIM = { code: "LIM", lat: -12.02, lon: -77.11 }, CUZ = { code: "CUZ", lat: -13.54, lon: -71.94 };
    const quito = { name: "Quito", lat: -0.2, lon: -78.5 }, lima = { name: "Lima", lat: -12.05, lon: -77.04 }, cusco = { name: "Cusco", lat: -13.52, lon: -71.97 };
    const UIO = { code: "UIO", lat: -0.14, lon: -78.49 };
    const legs = transferLegs([quito, lima, cusco], [UIO, LIM], () => CUZ, 2);
    expect(legs.map(l => `${l.ap.code}>${l.dest.name}`)).toEqual(["UIO>Quito", "LIM>Lima", "CUZ>Cusco"]);
    // weit weg von allen und kein großer Flughafen in Reichweite: kein Transfer
    expect(transferLegs([{ name: "Irgendwo", lat: 10, lon: 10 }], [UIO], () => null, 2)).toEqual([]);
    // gleiche Strecke nur einmal
    expect(transferLegs([lima, lima], [LIM], () => null, 2)).toHaveLength(1);
  });
});
