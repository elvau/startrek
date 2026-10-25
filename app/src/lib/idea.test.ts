import { describe, expect, it } from "vitest";
import { IDEA_CAR, familiesOf, ideaItems, mid } from "./idea";
import { PAGES, STAND } from "./seo/pages";
import { CAT_KEYS, type Traveler } from "./model";

describe("Reiseidee als Posten (#402)", () => {
  it("jede Zeile ein Posten mit Richtwert pro Person (Mitte der Spanne)", () => {
    for (const p of PAGES) {
      const items = ideaItems(p, STAND);
      expect(items).toHaveLength(p.costs.length);
      items.forEach((it, i) => {
        const c = p.costs[i];
        expect(CAT_KEYS).toContain(it.cat);
        expect(it.name).toBe(c.label);
        expect(it.options[0].estimate).toBe(true);
        expect(it.options[0].price).toEqual({ mode: "person", currency: "EUR", adult: mid(c.from, c.to) });
      });
    }
  });
  it("Reisen mit Unterkunft bekommen einen Posten Unterkunft, Flugreisen einen Flug", () => {
    const mallorca = ideaItems(PAGES.find(p => p.slug === "gruppenreise-mallorca-kosten")!, STAND);
    expect(mallorca.map(i => i.cat)).toEqual(expect.arrayContaining(["flights", "stay", "transport", "attractions", "misc"]));
    const festival = ideaItems(PAGES.find(p => p.slug === "festival-mit-freunden-kosten")!, STAND);
    expect(festival.some(i => i.cat === "attractions")).toBe(true);
  });
  it("Mitte gerundet", () => {
    expect(mid(120, 250)).toBe(185);
    expect(mid(5, 10)).toBe(8);
  });
  it("Auto-Anreise: ein Posten je Familie und Auto, nicht pro Kopf (#552)", () => {
    const page = PAGES.find(p => p.slug === "gardasee-mehrere-familien-kosten")!;
    const tr: Traveler[] = [
      { id: "a", name: "A", household: "Bär" }, { id: "b", name: "B", household: "Bär" }, { id: "c", name: "C", household: "Bär" },
      { id: "d", name: "D", household: "Fuchs" }, { id: "e", name: "E", household: "Fuchs" }, { id: "x", name: "X", household: "Fuchs", active: false }
    ];
    const fam = familiesOf(tr);
    expect(fam).toEqual([{ name: "Bär", ids: ["a", "b", "c"] }, { name: "Fuchs", ids: ["d", "e"] }]);
    const items = ideaItems(page, STAND, fam);
    const cars = items.filter(i => i.hint === IDEA_CAR);
    expect(cars).toHaveLength(2);
    expect(cars.map(i => i.participants)).toEqual([["a", "b", "c"], ["d", "e"]]);
    cars.forEach(i => expect(i.options[0].price).toEqual({ mode: "unit", currency: "EUR", unit: 160 }));
    // ohne Familien (Link ohne fam) bleibt es bei einer Zeile pro Kopf
    const plain = ideaItems(page, STAND);
    expect(plain.some(i => i.hint === IDEA_CAR)).toBe(false);
    expect(plain).toHaveLength(page.costs.length);
  });
});
