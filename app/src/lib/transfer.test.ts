import { describe, expect, it } from "vitest";
import { transferItem, transferPlan, vehicleFor, vehicleText } from "./transfer";

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
});
