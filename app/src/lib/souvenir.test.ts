import { describe, expect, it } from "vitest";
import { SOUVENIR_DEFAULT, souvenirRate, syncSouvenir } from "./souvenir";
import { totals } from "./calc";
import { costParts } from "./calc/parts";
import type { Trip } from "./model";

const trip = (more: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Test", place: "Musterdorf", country: "", travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 8 }, { id: "c", name: "Cleo", household: "Klein", age: 1 }],
  items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, detail: { misc: false }, ...more
});

describe("Souvenirs (#421)", () => {
  it("Betrag: eigener der Reise vor Vorlieben vor Richtwert", () => {
    expect(souvenirRate(trip(), {})).toEqual({ eur: SOUVENIR_DEFAULT, from: "default" });
    expect(souvenirRate(trip(), { souvenirs: 50 })).toEqual({ eur: 50, from: "prefs" });
    expect(souvenirRate(trip({ souvenir: { on: true, eur: 20 } }), { souvenirs: 50 })).toEqual({ eur: 20, from: "trip" });
  });

  it("legt einen Posten an (Kleinkinder frei), zählt im einfachen Modus als versteckt, ändert nichts beim zweiten Mal, räumt beim Ausschalten auf", () => {
    const t = trip({ souvenir: { on: true } });
    expect(syncSouvenir(t, { souvenirs: 40 })).toBe(true);
    const it = t.items.find(i => i.auto === "souvenir")!;
    expect(it).toMatchObject({ cat: "misc", name: "Souvenirs", status: "idea" });
    expect(totals(t).total).toBe(80);
    expect(costParts(t, totals(t)).sum.hidden).toBe(80);
    expect(syncSouvenir(t, { souvenirs: 40 })).toBe(false);
    expect(syncSouvenir(t, { souvenirs: 60 })).toBe(true);
    expect(totals(t).total).toBe(120);
    t.souvenir = { on: false };
    expect(syncSouvenir(t, {})).toBe(true);
    expect(t.items).toHaveLength(0);
  });

  it("0 € heißt aus", () => {
    const t = trip({ souvenir: { on: true } });
    expect(syncSouvenir(t, { souvenirs: 0 })).toBe(false);
    expect(t.items).toHaveLength(0);
  });
});
