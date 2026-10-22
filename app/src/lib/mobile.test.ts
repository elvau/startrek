import { describe, expect, it } from "vitest";
import { barOf, pageAt, PAGES, stepPage } from "./mobile.svelte";

describe("Handy-Pager (#530)", () => {
  it("Seiten: Übersicht, Kapitel, Tage, Abrechnung", () => {
    expect(PAGES).toEqual(["hero", "trav", "flights", "stay", "transport", "attractions", "misc", "plan", "split"]);
  });
  it("Seite aus der Lage des Pagers, auch von rechts nach links (scrollLeft negativ)", () => {
    expect(pageAt(0, 390)).toBe("hero");
    expect(pageAt(390 * 3 + 120, 390)).toBe("stay");
    expect(pageAt(-390 * 8, 390)).toBe("split");
    expect(pageAt(99999, 390)).toBe("split");
  });
  it("Leiste: Kapitel zählen zu Planen, Tage und Abrechnung eigene Einträge", () => {
    expect(["hero", "trav", "misc", "plan", "split"].map(p => barOf(p as never))).toEqual(["home", "plan", "plan", "days", "split"]);
  });
  it("blättern bleibt am Rand stehen", () => {
    expect(stepPage("hero", -1)).toBe("hero");
    expect(stepPage("hero", 1)).toBe("trav");
    expect(stepPage("split", 1)).toBe("split");
  });
});
