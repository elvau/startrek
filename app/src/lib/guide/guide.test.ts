import { describe, expect, it } from "vitest";
import { GUIDE_ART, guideArtSvg } from "./art";
import { GUIDE, GUIDE_UPDATED, guideSitemapUrls, guideTitle, renderGuideIndex, renderGuidePage } from "./pages";
import spots from "./shots/spots.json";

const FILES = Object.keys(import.meta.glob("./shots/*.jpg"));

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
    const html = renderGuidePage(GUIDE[1], GUIDE, guideArtSvg, spots);
    expect(html).toMatch(/<svg class="art" viewBox="0 0 1200 480" role="img" aria-label="[^"]+"/);
    expect(html).toContain('<ol class="steps" data-slug="reisende">');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain(`${GUIDE[1].emoji}`);
    expect(html).toContain(`href="../${GUIDE[0].slug}/"`);
    expect(html).toContain(`href="../${GUIDE[2].slug}/"`);
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it("Screenshots: Datei da, Markierungen aus spots.json, jede Erklärung hat eine Markierung", () => {
    for (const p of GUIDE) for (const sh of p.shots ?? []) {
      expect(FILES, sh.img).toContain(`./shots/${sh.img}.jpg`);
      const sp = (spots as Record<string, { spots: { key: string }[] }>)[sh.img];
      expect(sp, sh.img).toBeTruthy();
      for (const k of Object.keys(sh.pins)) expect(sp.spots.some(s => s.key === k), `${sh.img}:${k}`).toBe(true);
      expect(sh.alt.length, sh.img).toBeGreaterThan(20);
    }
    const html = renderGuidePage(GUIDE[2], GUIDE, guideArtSvg, spots);
    expect(html.match(/class="pin"/g)?.length).toBe(Object.keys(GUIDE[2].shots![0].pins).length);
    expect(html).toContain('src="../img/flights.jpg"');
  });
  it("Mini-Demos nur dort, wo sie hingehören", () => {
    expect(renderGuidePage(GUIDE.find(p => p.demo === "status")!, GUIDE, guideArtSvg, spots)).toContain(`<section class="demo" data-demo="status"`);
    expect(renderGuidePage(GUIDE.find(p => p.demo === "split")!, GUIDE, guideArtSvg, spots)).toContain(`<section class="demo" data-demo="split"`);
    expect(renderGuidePage(GUIDE[0], GUIDE, guideArtSvg, spots)).not.toContain(`<section class="demo"`);
  });
  it("Übersicht: alle Szenen, Verlaufs-IDs nicht doppelt", () => {
    const html = renderGuideIndex(GUIDE, guideArtSvg);
    expect(html.match(/<svg class="thumb"/g)).toHaveLength(GUIDE.length);
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it("Sitemap: Übersicht und alle Seiten mit Änderungsdatum", () => {
    expect(guideSitemapUrls(GUIDE)).toHaveLength(GUIDE.length + 1);
    for (const u of guideSitemapUrls(GUIDE)) expect(u.lastmod).toBe(GUIDE_UPDATED);
    expect(GUIDE_UPDATED <= new Date().toISOString().slice(0, 10)).toBe(true);
  });
  it("Titel höchstens 60 Zeichen, „Anleitung“ nicht doppelt", () => {
    for (const p of GUIDE) expect(guideTitle(p.title).length, p.slug).toBeLessThanOrEqual(60);
    expect(guideTitle("Erste Reise anlegen")).toBe("Erste Reise anlegen – Anleitung | Split&Fly");
    const idx = renderGuideIndex(GUIDE).match(/<title>(.+?)<\/title>/)![1];
    expect(idx.match(/Anleitung/g)).toHaveLength(1);
    expect(idx.replace(/&amp;/g, "&").length).toBeLessThanOrEqual(60);
  });
  it("ohne Szene leer", () => expect(guideArtSvg("gibt-es-nicht")).toBe(""));
});
