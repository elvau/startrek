import { describe, expect, it } from "vitest";
import { nextAnimal, placeholderTravelers } from "./placeholders";
import { ageClass, totals } from "./calc";
import { DEFAULT_SETTINGS, type Trip } from "./model";

describe("Platzhalter-Familien", () => {
  const ts = placeholderTravelers([{ animal: "Reh", adults: 2, kids: 3 }, { animal: "Bär", adults: 2, kids: 3 }]);
  it("legt Erwachsene und Kinder je Familie an", () => {
    expect(ts).toHaveLength(10);
    expect(ts.filter(t => t.household === "Reh").map(t => t.name)).toEqual(["Reh Erw. 1", "Reh Erw. 2", "Reh Kind 1", "Reh Kind 2", "Reh Kind 3"]);
    expect(ts.every(t => t.placeholder && t.age == null)).toBe(true);
  });
  it("Kinder ohne Alter zählen als Kind, ein eingetragenes Alter gewinnt", () => {
    expect(ageClass(undefined, DEFAULT_SETTINGS, "child")).toBe("child");
    expect(ageClass(15, DEFAULT_SETTINGS, "child")).toBe("adult");
  });
  it("Kinderpreis gilt für Platzhalter-Kinder", () => {
    const trip: Trip = {
      id: "t", name: "", place: "", country: "", travelers: ts, tiers: {}, settings: { ...DEFAULT_SETTINGS },
      items: [{ id: "e", cat: "attractions", name: "Zoo", status: "chosen", options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 20, child: 10 } }] }]
    };
    expect(totals(trip).byCat.attractions).toBe(4 * 20 + 6 * 10);
    expect(totals(trip).byHousehold).toEqual({ Reh: 70, Bär: 70 });
  });
  it("nimmt das nächste freie Tier", () => {
    expect(nextAnimal([])).toBe("Reh");
    expect(nextAnimal(["Reh", "Bär"])).toBe("Fuchs");
  });
});
