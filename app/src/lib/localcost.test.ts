import { describe, expect, it } from "vitest";
import { FUEL_KM, LOCAL_KM, localPlan, syncLocal, type TransferLegPlan } from "./localcost";
import { totals } from "./calc";
import { costParts } from "./calc/parts";
import type { Item, Trip } from "./model";

const money = (v: number) => `${v} €`;
const flight: Item = { id: "f", cat: "flights", name: "Flug", status: "chosen", access: false, options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 600 } }] };
const trip = (items: Item[] = [flight], more: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Test", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-13",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 8 }],
  items, tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 }, kmCost: 0.3 }, detail: { flights: true, transport: false }, ...more
});
const leg: TransferLegPlan = {
  plan: { ap: "PMI", to: "Casa Palma", km: 12, vehicle: "taxi", count: 1, perRide: 35 } as TransferLegPlan["plan"],
  ap: { code: "PMI", lat: 0, lon: 0 }, dest: { name: "Casa Palma", lat: 0, lon: 0 },
  choices: [{ k: "bus", adult: 5, perRide: 8, line: "A1" }, { k: "taxi", perRide: 35 }]
};

describe("Transport vor Ort (#420)", () => {
  it("ohne Auto: Transfer hin und zurück (günstigste Möglichkeit) und Nahverkehr pro Person und Tag", () => {
    const p = localPlan(trip(), [leg], 1);
    expect(p.transfer).toEqual({ eur: 16, legs: [{ ap: "PMI", to: "Casa Palma", k: "bus", perRide: 8 }] });
    expect(p.daily).toEqual({ mode: "transit", adult: 5, child: 2.5, days: 7, adults: 1, children: 1 });
    // höheres Preisniveau: teurer
    expect((localPlan(trip(), [leg], 2).daily as { adult: number }).adult).toBeGreaterThan(5);
  });

  it("Mietwagen: kein Transfer, Sprit statt Fahrkarten; eigenes Auto mit km-Satz", () => {
    const car: Item = { id: "c", cat: "transport", name: "Mietwagen", icon: "car", hint: "rental", status: "idea", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 200 } }] };
    const p = localPlan(trip([flight, car]), [leg]);
    expect(p.transfer).toBeUndefined();
    expect(p.daily).toEqual({ mode: "car", own: false, perKm: FUEL_KM, km: LOCAL_KM, days: 7 });
    const road: Item = { ...car, id: "r", hint: "road:car", name: "Auto" };
    expect(localPlan(trip([road]), []).daily).toMatchObject({ mode: "car", own: true, perKm: 0.3 });
  });

  it("eigene Posten ersetzen die Schätzung: Transfer den Transfer, ein Ticket das Unterwegssein; ohne Daten kein Unterwegssein", () => {
    const tr: Item = { id: "x", cat: "transport", name: "Flughafentransfer", hint: "transfer", status: "idea", options: [] };
    expect(localPlan(trip([flight, tr]), [leg]).transfer).toBeUndefined();
    const pass: Item = { id: "y", cat: "transport", name: "Wochenkarte", status: "chosen", options: [] };
    expect(localPlan(trip([flight, pass]), [leg]).daily).toBeUndefined();
    expect(localPlan(trip([flight], { from: undefined, to: undefined }), [leg]).daily).toBeUndefined();
  });

  it("einfacher Modus: eigener Betrag oder Eintrag für Transport ersetzt das Unterwegssein (#424)", () => {
    const base = { detail: { flights: true, transport: false } };
    expect(localPlan(trip([flight], base), [leg]).daily).toBeDefined();
    expect(localPlan(trip([flight], { ...base, simple: { transport: 300 } }), [leg]).daily).toBeUndefined();
    const line = { id: "l", cat: "transport" as const, label: "Mietwagen", amount: 400 };
    expect(localPlan(trip([flight], { ...base, lines: [line] }), [leg]).daily).toBeUndefined();
    // detailliert zählt der einfache Betrag nicht, die Schätzung bleibt
    expect(localPlan(trip([flight], { detail: { transport: true }, simple: { transport: 300 } }), [leg]).daily).toBeDefined();
  });

  it("legt zwei Posten an (zählen im einfachen Modus als versteckt), räumt beim Ausschalten auf", () => {
    const t = trip([flight], { local: { on: true } });
    const p = localPlan(t, [leg]);
    expect(syncLocal(t, p, money)).toBe(true);
    expect(syncLocal(t, p, money)).toBe(false);
    const auto = t.items.filter(i => i.auto === "local");
    expect(auto.map(i => i.hh)).toEqual(["transfer", "daily"]);
    const T = totals(t);
    // Transfer 2 × 8 €, Nahverkehr 7 Tage × (5 € + 2,50 €)
    const parts = costParts(t, T);
    expect(parts.sum.hidden).toBe(16 + 7 * 7.5);
    expect(parts.rows.hidden.find(r => r.name.includes("Nahverkehr"))?.calc).toContain("7 Tage");
    t.local = { on: false };
    expect(syncLocal(t, p, money)).toBe(true);
    expect(t.items.some(i => i.auto === "local")).toBe(false);
  });
});
