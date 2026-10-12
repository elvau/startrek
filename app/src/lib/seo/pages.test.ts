import { describe, expect, it } from "vitest";
import { PAGES, planHref, renderIndex, renderPage, round10, sitemapUrls, total } from "./pages";
import { parsePlan } from "../plan";

describe("Inhaltsseiten (#314)", () => {
  it("15 Seiten, Ziele und Anlässe, eindeutige Adressen", () => {
    expect(PAGES).toHaveLength(15);
    expect(new Set(PAGES.map(p => p.slug)).size).toBe(15);
    expect(PAGES.filter(p => p.kind === "ziel").length).toBeGreaterThan(0);
    expect(PAGES.filter(p => p.kind === "anlass").length).toBeGreaterThan(0);
    for (const p of PAGES) expect(p.slug).toMatch(/^[a-z0-9-]+$/);
  });
  it("Titel und Beschreibung in passender Länge, verwandte Seiten existieren", () => {
    for (const p of PAGES) {
      expect(p.title.length, p.slug).toBeLessThanOrEqual(60);
      expect(p.description.length, p.slug).toBeGreaterThanOrEqual(110);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(160);
      for (const r of p.related) expect(PAGES.some(x => x.slug === r), `${p.slug} → ${r}`).toBe(true);
      for (const c of p.costs) expect(c.from, c.label).toBeLessThanOrEqual(c.to);
    }
  });
  it("Link in die App ergibt eine Reise mit Ziel und Gruppe", () => {
    for (const p of PAGES) {
      const href = planHref(p);
      expect(href.startsWith("../../?")).toBe(true);
      const plan = parsePlan(href.slice(href.indexOf("?")))!;
      expect(plan.place).toBe(p.plan.ziel);
      expect(plan.cc).toBe(p.plan.land);
      expect(!!(plan.group || plan.fam?.length)).toBe(true);
    }
  });
  it("Seite: Summe gerundet, Hinweis Richtwerte, strukturierte Daten gültig", () => {
    const p = PAGES[0], html = renderPage(p);
    const t = total(p);
    expect(html).toContain(`<link rel="canonical" href="https://splitandfly.com/reise/${p.slug}/">`);
    expect(html).toContain(`${round10(t.to, 1).toLocaleString("de-DE")} €`);
    expect(html).toContain("Richtwerte");
    for (const m of html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/g)) expect(() => JSON.parse(m[1])).not.toThrow();
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
  });
  it("Übersicht verlinkt alle Seiten, Sitemap enthält alle", () => {
    const idx = renderIndex();
    for (const p of PAGES) expect(idx).toContain(`href="${p.slug}/"`);
    expect(sitemapUrls()).toHaveLength(16);
  });
  it("Runden auf Zehner", () => {
    expect(round10(557, -1)).toBe(550);
    expect(round10(922, 1)).toBe(930);
    expect(round10(560, 1)).toBe(560);
  });
});
