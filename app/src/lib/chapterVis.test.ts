import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";
import { createPackage, breakPkg } from "./package";
import { activePkgs, chapterOf, hiddenChapters, pkgItems, visibleChapters } from "./chapterVis";

const trip = (o: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Kroatien", autoName: false, place: "Split", country: "HR", from: "2027-07-12", to: "2027-07-19",
  travelers: [{ id: "a", name: "Anna", household: "Berg", kind: "adult" }, { id: "b", name: "Ben", household: "Berg", kind: "adult" }],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, ...o
});
const item = (o: Partial<Item>): Item => ({ id: o.id || "i", cat: "flights", name: "", status: "idea", options: [], ...o });
const keys = (t: Trip) => visibleChapters(t).map(c => c.k);

describe("sichtbare Kapitel (#618)", () => {
  it("ohne Paket: alle Kapitel außer Gesamtpaket", () => {
    expect(keys(trip())).toEqual(["trav", "flights", "stay", "transport", "attractions", "misc", "plan", "split"]);
  });

  it("mit Paket: Gesamtpaket statt Abheben und Unterkunft, Teile stehen im Paket", () => {
    const t = trip();
    const parts = createPackage(t, { price: 2000, parts: ["flights", "stay", "transport"] });
    expect(keys(t)).toEqual(["trav", "pkg", "transport", "attractions", "misc", "plan", "split"]);
    expect(activePkgs(t)).toHaveLength(1);
    expect([...pkgItems(t)].sort()).toEqual(parts.map(p => p.id).sort());
    // Ergänzung (Nachzügler-Flug) steht ebenfalls im Gesamtpaket, Mietwagen im Transport
    const late = item({ id: "late", cat: "flights" }), car = item({ id: "car", cat: "transport" });
    t.items.push(late, car);
    expect(chapterOf(t, late)).toBe("pkg");
    expect(chapterOf(t, car)).toBe("transport");
    expect(chapterOf(t, parts.find(p => p.cat === "transport")!)).toBe("pkg");
  });

  it("Paket aufgebrochen: wieder Abheben und Unterkunft", () => {
    const t = trip();
    createPackage(t, { price: 2000, parts: ["flights", "stay"] });
    breakPkg(t, activePkgs(t)[0]);
    expect(activePkgs(t)).toEqual([]);
    expect(keys(t)).toContain("flights");
    expect(keys(t)).not.toContain("pkg");
  });

  it("Reise ohne Flug: Abheben verschwindet, solange nichts darin steht", () => {
    expect(hiddenChapters(trip({ camper: {} })).has("flights")).toBe(true);
    expect(hiddenChapters(trip({ items: [item({ cat: "transport", arrival: true })] })).has("flights")).toBe(true);
    expect(hiddenChapters(trip({ chapters: { flights: false } })).has("flights")).toBe(true);
    // ohne Hinweis auf eine Reise ohne Flug bleibt es
    expect(hiddenChapters(trip()).has("flights")).toBe(false);
  });

  it("„Flug hinzufügen“ bzw. ein Flug bringt Abheben zurück", () => {
    expect(hiddenChapters(trip({ camper: {}, chapters: { flights: true } })).has("flights")).toBe(false);
    expect(hiddenChapters(trip({ camper: {}, items: [item({ cat: "flights" })] })).has("flights")).toBe(false);
    expect(hiddenChapters(trip({ camper: {}, simple: { flights: 300 } })).has("flights")).toBe(false);
  });
});
