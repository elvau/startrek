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
    // „Ohne“ hat keinen Wohnort: Region des Erstellers (Kegler) angenommen, Lea zählt dort als Schulkind (#584)
    expect(calBase(t, "Kegler")).toEqual({ regions: { "DE-NW": ["Sendler"], "DE-NI": ["Kegler", "Ohne"] }, kidRegions: ["DE-NW", "DE-NI"], marks: {}, lead: "DE-NI", kids: true, assumed: ["Ohne"] });
    // ohne Ersteller: erste bekannte Region
    expect(calBase(t).lead).toBe("DE-NW");
  });
  it("Kind ohne Alter zählt als Schulkind, Kleinkind nicht; ohne jeden Wohnort keine Region, aber Schulkinder (#584)", () => {
    const t = {
      id: "t", name: "", place: "", country: "", items: [], tiers: {}, settings: {} as Trip["settings"],
      travelers: [{ id: "1", name: "Fuchs Erw. 1", household: "Fuchs" }, { id: "2", name: "Fuchs Kind 1", household: "Fuchs", kind: "child" }, { id: "3", name: "Hase Kleinkind 1", household: "Hase", kind: "infant" }]
    } as Trip;
    expect(calBase(t, "Fuchs")).toEqual({ regions: {}, kidRegions: [], marks: {}, kids: true });
    expect(calBase({ ...t, travelers: [t.travelers[0], t.travelers[2]] }).kids).toBe(false);
  });
});
