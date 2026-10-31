import { describe, expect, it } from "vitest";
import { pageAt, pages, stepPage } from "./mobile.svelte";
import { shown } from "./chapterVis.svelte";

describe("Handy-Pager (#530)", () => {
  it("Seiten: Übersicht, Kapitel, Tage, Abrechnung", () => {
    expect(pages()).toEqual(["hero", "trav", "flights", "stay", "transport", "attractions", "misc", "plan", "split"]);
  });
  it("Seiten folgen den sichtbaren Kapiteln (#618): Gesamtpaket statt Abheben und Unterkunft", () => {
    const was = shown.keys;
    shown.keys = ["trav", "pkg", "transport", "attractions", "misc", "plan", "split"];
    expect(pages()).toEqual(["hero", "trav", "pkg", "transport", "attractions", "misc", "plan", "split"]);
    expect(stepPage("trav", 1)).toBe("pkg");
    shown.keys = was;
  });
  it("Seite aus der Lage des Pagers, auch von rechts nach links (scrollLeft negativ)", () => {
    expect(pageAt(0, 390)).toBe("hero");
    expect(pageAt(390 * 3 + 120, 390)).toBe("stay");
    expect(pageAt(-390 * 8, 390)).toBe("split");
    expect(pageAt(99999, 390)).toBe("split");
  });
  it("blättern bleibt am Rand stehen", () => {
    expect(stepPage("hero", -1)).toBe("hero");
    expect(stepPage("hero", 1)).toBe("trav");
    expect(stepPage("split", 1)).toBe("split");
  });
});
