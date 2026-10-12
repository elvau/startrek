import { describe, expect, it } from "vitest";
import { ART, artSvg } from "./art";
import { PAGES, renderIndex, renderPage } from "./pages";

describe("Illustrationen der Inhaltsseiten", () => {
  it("jede Seite hat eine Szene mit Bildbeschreibung", () => {
    for (const p of PAGES) {
      expect(ART[p.slug], p.slug).toBeTruthy();
      expect(ART[p.slug].alt.length, p.slug).toBeGreaterThan(15);
    }
    expect(Object.keys(ART).filter(k => !PAGES.some(p => p.slug === k))).toEqual([]);
  });
  it("Seite zeigt die Szene als Bild mit Beschreibung", () => {
    const html = renderPage(PAGES[8], PAGES, artSvg);
    expect(html).toMatch(/<svg class="art" viewBox="0 0 1200 480" role="img" aria-label="[^"]+"/);
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it("Übersicht: alle Szenen, Verlaufs-IDs nicht doppelt", () => {
    const html = renderIndex(PAGES, artSvg);
    expect(html.match(/<svg class="thumb"/g)).toHaveLength(15);
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("ohne Szene leer", () => expect(artSvg("gibt-es-nicht")).toBe(""));
});
