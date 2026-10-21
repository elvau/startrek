import { describe, expect, it } from "vitest";
import { ANIMALS, groupTravelers, nextAnimal, partyTravelers, placeholderTravelers, soloTraveler, resizeTravelers, rowsAfterResize } from "./placeholders";
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
  it("Kleinkinder bekommen ihren eigenen Preis", () => {
    const ks = placeholderTravelers([{ animal: "Igel", adults: 1, kids: 1, infants: 2 }]);
    expect(ks.map(t => t.name)).toEqual(["Igel Erw. 1", "Igel Kind 1", "Igel Kleinkind 1", "Igel Kleinkind 2"]);
    const trip: Trip = {
      id: "t", name: "", place: "", country: "", travelers: ks, tiers: {}, settings: { ...DEFAULT_SETTINGS },
      items: [{ id: "e", cat: "attractions", name: "Zoo", status: "chosen", options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 20, child: 10, infant: 0 } }] }]
    };
    expect(totals(trip).byCat.attractions).toBe(30);
  });
  it("nimmt ein zufälliges freies Tier", () => {
    const seen = new Set(Array.from({ length: 200 }, () => nextAnimal(["Reh", "Bär"])));
    expect(seen.has("Reh") || seen.has("Bär")).toBe(false);
    expect(seen.size).toBeGreaterThan(5);
    expect(nextAnimal([], () => 0)).toBe(ANIMALS[0][0]);
    // alle vergeben: trotzdem ein Tier
    expect(ANIMALS.map(a => a[0])).toContain(nextAnimal(ANIMALS.map(a => a[0])));
  });
  it("Solo ist nicht immer das Reh", () => {
    const seen = new Set(Array.from({ length: 100 }, () => soloTraveler().household));
    expect(seen.size).toBeGreaterThan(3);
  });
  it("Gruppe: jede Person eine eigene Familie, bei vielen mit Nummer", () => {
    const g = groupTravelers(25, 3);
    expect(g).toHaveLength(28);
    expect(new Set(g.map(t => t.household)).size).toBe(28);
    expect(g.filter(t => t.kind === "child")).toHaveLength(3);
    expect(g.some(t => / 2$/.test(t.name))).toBe(true);
  });
});

describe("Reisende ohne Namen (KI-Planer, Import)", () => {
  const households = (ts: { household: string }[]) => new Set(ts.map(t => t.household)).size;
  it("Gruppe: jede Person ein eigenes Tier, das erste wie vorgegeben", () => {
    const g = partyTravelers({ adults: 6, kids: 0, kind: "group" }, "Tiger");
    expect(g).toHaveLength(6);
    expect(households(g)).toBe(6);
    expect(g[0].name).toBe("Tiger");
  });
  it("Familie und Paar teilen sich ein Tier, Kinder mit dem Tier der Eltern", () => {
    expect(partyTravelers({ adults: 2, kids: 2, infants: 1, kind: "family" }, "Reh").map(t => t.name)).toEqual(["Reh Erw. 1", "Reh Erw. 2", "Reh Kind 1", "Reh Kind 2", "Reh Kleinkind 1"]);
    expect(households(partyTravelers({ adults: 2, kids: 0, kind: "couple" }, "Reh"))).toBe(1);
  });
  it("ohne Angabe: mit Kindern Familie, nur Erwachsene Gruppe", () => {
    expect(households(partyTravelers({ adults: 2, kids: 1 }))).toBe(1);
    expect(households(partyTravelers({ adults: 6, kids: 0 }))).toBe(6);
    expect(households(partyTravelers({ adults: 1, kids: 0 }))).toBe(1);
  });
  it("Gruppe mit Kindern und Kleinkindern behält die Altersklassen", () => {
    expect(partyTravelers({ adults: 2, kids: 1, infants: 1, kind: "group" }).map(t => t.kind)).toEqual(["adult", "adult", "child", "infant"]);
  });
});

describe("resizeTravelers", () => {
  const mk = () => ({ travelers: soloOnly(), items: [{ participants: [] as string[] }] });
  function soloOnly() { return groupTravelers(1); }
  it("ergänzt erwachsene Platzhalter", () => {
    const tr = mk();
    expect(resizeTravelers(tr, 3)).toBe(3);
    expect(tr.travelers.every(x => x.kind === "adult" && x.placeholder)).toBe(true);
    expect(new Set(tr.travelers.map(x => x.id)).size).toBe(3);
  });
  it("nimmt von hinten weg, auch aus den Posten, und lässt mindestens 1", () => {
    const tr = mk();
    resizeTravelers(tr, 3);
    tr.items[0].participants = tr.travelers.map(x => x.id);
    expect(resizeTravelers(tr, 2)).toBe(2);
    expect(tr.items[0].participants).toHaveLength(2);
    expect(resizeTravelers(tr, 0)).toBe(1);
  });
});

describe("rowsAfterResize", () => {
  it("behält Ergebnisse bei gleicher Personenzahl", () => {
    const rows = [1, 2];
    expect(rowsAfterResize(rows, 2, 2)).toBe(rows);
  });
  it("verwirft Ergebnisse, wenn sich die Personenzahl ändert", () => {
    expect(rowsAfterResize([1, 2], 2, 3)).toBeNull();
    expect(rowsAfterResize([1, 2], 3, 2)).toBeNull();
  });
});
