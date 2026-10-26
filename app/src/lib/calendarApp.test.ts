import { describe, expect, it } from "vitest";
import { calBase } from "./calendarApp.svelte";
import type { Trip } from "./model";

describe("Regionen für „Termin finden“ (#568)", () => {
  it("Regionen der Familien (geschätzt oder gewählt), Schulkinder 6–18, nicht Dabei zählen nicht", () => {
    const t = {
      id: "t", name: "", place: "", country: "", items: [], tiers: {}, settings: {} as Trip["settings"],
      travelers: [
        { id: "1", name: "Markus", household: "Sendler" }, { id: "2", name: "Emily", household: "Sendler", age: 8 },
        { id: "3", name: "Timo", household: "Kegler" }, { id: "4", name: "Baby", household: "Kegler", age: 1 },
        { id: "5", name: "Ingolf", household: "Weg", active: false }, { id: "6", name: "Lea", household: "Ohne", age: 10 }
      ],
      households: { Sendler: { plz: "44787" }, Kegler: { plz: "44787", region: "DE-NI" }, Weg: { plz: "80331" } }
    } as Trip;
    expect(calBase(t)).toEqual({ regions: { "DE-NW": ["Sendler"], "DE-NI": ["Kegler"] }, kidRegions: ["DE-NW"], marks: {} });
  });
});
