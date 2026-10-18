import { describe, expect, it } from "vitest";
import { GUIDE_ART, guideArtSvg } from "./art";
import { GUIDE, guideSitemapUrls, renderGuideIndex, renderGuidePage } from "./pages";

describe("Anleitung", () => {
  it("jede Seite hat Szene, Schritte, Tipps und Fragen", () => {
    for (const p of GUIDE) {
      expect(GUIDE_ART[p.slug], p.slug).toBeTruthy();
      expect(GUIDE_ART[p.slug].alt.length, p.slug).toBeGreaterThan(15);
      expect(p.steps.length, p.slug).toBeGreaterThanOrEqual(4);
      expect(p.tips.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.faq.length, p.slug).toBeGreaterThanOrEqual(2);
      expect(p.description.length, p.slug).toBeGreaterThan(100);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(180);
    }
    expect(Object.keys(GUIDE_ART).filter(k => !GUIDE.some(p => p.slug === k))).toEqual([]);
    expect(new Set(GUIDE.map(p => p.slug)).size).toBe(GUIDE.length);
  });
  it("Seite: Szene, Schritte, Blättern", () => {
    const html = renderGuidePage(GUIDE[1], GUIDE, guideArtSvg);
    expect(html).toMatch(/<svg class="art" viewBox="0 0 1200 480" role="img" aria-label="[^"]+"/);
    expect(html).toContain('<ol class="steps">');
    expect(html).toContain(`href="../${GUIDE[0].slug}/"`);
    expect(html).toContain(`href="../${GUIDE[2].slug}/"`);
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it("Übersicht: alle Szenen, Verlaufs-IDs nicht doppelt", () => {
    const html = renderGuideIndex(GUIDE, guideArtSvg);
    expect(html.match(/<svg class="thumb"/g)).toHaveLength(GUIDE.length);
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it("Sitemap: Übersicht und alle Seiten", () => expect(guideSitemapUrls(GUIDE)).toHaveLength(GUIDE.length + 1));
  it("ohne Szene leer", () => expect(guideArtSvg("gibt-es-nicht")).toBe(""));
});
