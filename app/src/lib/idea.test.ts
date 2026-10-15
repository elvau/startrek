import { describe, expect, it } from "vitest";
import { ideaItems, mid } from "./idea";
import { PAGES, STAND } from "./seo/pages";
import { CAT_KEYS } from "./model";

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
});
