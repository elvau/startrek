import { describe, expect, it } from "vitest";
import { pinnedChapter } from "./scroll.svelte";

// Minimales Element: closest liefert das Kapitel, falls vorhanden
const el = (ch?: string) => ({ closest: () => (ch ? { dataset: { ch } } : null) }) as unknown as EventTarget;

describe("pinnedChapter", () => {
  it("liefert das Kapitel, in dem bedient wurde", () => {
    expect(pinnedChapter(el("stay"))).toBe("stay");
  });
  it("liefert null außerhalb der Kapitel (Navigation, Kopfzeile)", () => {
    expect(pinnedChapter(el())).toBeNull();
    expect(pinnedChapter(null)).toBeNull();
  });
});
