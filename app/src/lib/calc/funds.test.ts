import { describe, expect, it } from "vitest";
import { householdShares, totals } from "./index";
import { DEFAULT_SETTINGS, type Fund, type Item, type Trip } from "../model";

// Mannschaftsfahrt: 3 Spieler, 1 Betreuer; Bus 400 € für alle, Hotel 100 € je Person nur für die Spieler
const team = (funds: Fund[] = []): Trip => ({
  id: "t", name: "Tour", place: "Prag", country: "CZ",
  travelers: [
    { id: "p1", name: "Max", age: 25, household: "Spieler" },
    { id: "p2", name: "Tim", age: 25, household: "Spieler" },
    { id: "p3", name: "Leo", age: 25, household: "Spieler" },
    { id: "c", name: "Uwe", age: 55, household: "Betreuer" }
  ],
  items: [
    { id: "bus", cat: "transport", name: "Bus", status: "booked", options: [{ id: "o", label: "Bus", price: { mode: "unit", currency: "EUR", unit: 400 } }] },
    { id: "hot", cat: "stay", name: "Hotel", status: "chosen", participants: ["p1", "p2", "p3"], options: [{ id: "o", label: "Hotel", price: { mode: "person", currency: "EUR", adult: 100 } }] }
  ] as Item[],
  tiers: {}, settings: { ...DEFAULT_SETTINGS, rates: { EUR: 1 } }, detail: { transport: true, stay: true }, funds
});

describe("Zuschüsse", () => {
  it("ohne Zuschuss: Eigenanteil = Kosten", () => {
    const T = totals(team());
    expect(T.total).toBe(700);
    expect(T.funds).toBe(0);
    expect(T.due).toBe(700);
  });
  it("Mannschaftskasse für alle, gleich je Person", () => {
    const T = totals(team([{ id: "k", name: "Kasse", amount: 200, received: true }]));
    expect(T.funds).toBe(200);
    expect(T.fundsReceived).toBe(200);
    expect(T.due).toBe(500);
    expect(T.fundBy).toEqual({ p1: 50, p2: 50, p3: 50, c: 50 });
  });
  it("gleich je Person, höchstens bis die Kosten gedeckt sind: der Rest geht an die anderen, Überschuss bleibt stehen", () => {
    // Betreuer kostet 100 (nur Bus), Spieler je 200
    const T = totals(team([{ id: "k", name: "Kasse", amount: 800 }]));
    expect(T.fundBy.c).toBeCloseTo(100);
    expect(T.fundBy.p1).toBeCloseTo(200);
    expect(T.funds).toBeCloseTo(700);
    expect(T.fundUse.k.surplus).toBeCloseTo(100);
    expect(T.due).toBeCloseTo(0);
    expect(T.fundsReceived).toBe(0);
  });
  it("nach Anteil: im Verhältnis der Kosten", () => {
    const T = totals(team([{ id: "s", name: "Sponsor", amount: 140, split: "share" }]));
    expect(T.fundBy.p1).toBeCloseTo(40);
    expect(T.fundBy.c).toBeCloseTo(20);
  });
  it("nur für bestimmte Personen und nur für einen Bereich", () => {
    const T = totals(team([{ id: "o", name: "Oma", amount: 90, for: ["p1", "c"], cat: "transport" }]));
    // je 100 Bus-Kosten, 45 für jeden der beiden
    expect(T.fundBy).toEqual({ p1: 45, c: 45 });
    const cap = totals(team([{ id: "o", name: "Oma", amount: 500, for: ["p1"], cat: "transport" }]));
    expect(cap.fundBy.p1).toBeCloseTo(100);
    expect(cap.fundUse.o.surplus).toBeCloseTo(400);
  });
  it("Abrechnung je Haushalt: Kosten, Zuschüsse einzeln, Eigenanteil", () => {
    const trip = team([{ id: "k", name: "Kasse", amount: 200, received: true }, { id: "o", name: "Oma", amount: 30, for: ["c"] }]);
    const sh = householdShares(trip, totals(trip));
    const coach = sh.find(h => h.name === "Betreuer")!, players = sh.find(h => h.name === "Spieler")!;
    expect(coach.costs).toBeCloseTo(100);
    expect(coach.funds.map(f => [f.name, Math.round(f.v)])).toEqual([["Kasse", 50], ["Oma", 30]]);
    expect(coach.total).toBeCloseTo(20);
    expect(players.total).toBeCloseTo(600 - 150);
    expect(players.members[0].v).toBeCloseTo(150);
  });
});
