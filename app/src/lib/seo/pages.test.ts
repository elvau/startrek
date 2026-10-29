import { describe, expect, it } from "vitest";
import { DIR, PAGES, UPDATED, pageIn, pathOf, planHref, renderIndex, renderPage, round10, sitemapUrls, total } from "./pages";
import { EN } from "./pages.en";
import { ideasDir, parsePlan } from "../plan";

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
      expect(`${p.title} | Split&Fly`.length, p.slug).toBeLessThanOrEqual(60);
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
      expect(plan.idea).toBe(p.slug);
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
    expect(sitemapUrls()).toHaveLength(32);
    for (const u of sitemapUrls()) expect(u.lastmod, u.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sitemapUrls().map(u => u.loc)).toContain(`https://splitandfly.com/en/trip-ideas/${EN[PAGES[0].slug].slug}/`);
  });
  it("Änderungsdatum: gültig, nicht in der Zukunft, steht in den strukturierten Daten", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const p of PAGES) {
      const d = p.updated ?? UPDATED;
      expect(Number.isNaN(Date.parse(d)), p.slug).toBe(false);
      expect(d <= today, p.slug).toBe(true);
    }
    expect(renderPage(PAGES[0])).toContain(`"dateModified":"${PAGES[0].updated ?? UPDATED}"`);
  });
  it("Runden auf Zehner", () => {
    expect(round10(557, -1)).toBe(550);
    expect(round10(922, 1)).toBe(930);
    expect(round10(560, 1)).toBe(560);
  });
});

describe("Reiseideen auf Englisch", () => {
  it("jede Seite übersetzt, gleiche Zeilen, Längen wie im Deutschen, eindeutige Adressen", () => {
    expect(Object.keys(EN).sort()).toEqual(PAGES.map(p => p.slug).sort());
    expect(new Set(Object.values(EN).map(e => e.slug)).size).toBe(PAGES.length);
    for (const p of PAGES) {
      const e = EN[p.slug];
      expect(e.slug, p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(e.costs, p.slug).toHaveLength(p.costs.length);
      p.costs.forEach((c, i) => expect(!!e.costs[i].note, `${p.slug} ${i}`).toBe(!!c.note));
      expect(!!e.costNote, p.slug).toBe(!!p.costNote);
      expect(e.faq.length, p.slug).toBe(p.faq.length);
      expect(`${e.title} | Split&Fly`.length, p.slug).toBeLessThanOrEqual(60);
      expect(e.description.length, p.slug).toBeGreaterThanOrEqual(110);
      expect(e.description.length, p.slug).toBeLessThanOrEqual(160);
      expect(e.alt.length, p.slug).toBeGreaterThan(15);
    }
  });
  it("Seite: Sprache, hreflang in beide Richtungen, Beträge in Euro, keine deutschen Rahmentexte", () => {
    const p = PAGES[0], de = renderPage(p), en = renderPage(p, PAGES, undefined, "en");
    const deUrl = `https://splitandfly.com/${pathOf(p, "de")}`, enUrl = `https://splitandfly.com/${pathOf(p, "en")}`;
    for (const html of [de, en]) {
      expect(html).toContain(`<link rel="alternate" hreflang="de" href="${deUrl}">`);
      expect(html).toContain(`<link rel="alternate" hreflang="en" href="${enUrl}">`);
      expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${deUrl}">`);
      for (const m of html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/g)) expect(() => JSON.parse(m[1])).not.toThrow();
    }
    expect(en).toContain('<html lang="en">');
    expect(en).toContain(`<link rel="canonical" href="${enUrl}">`);
    const t = total(p), n = (x: number) => x.toLocaleString("en-GB");
    expect(en).toContain(`approx. €${n(round10(t.from, -1))}–${n(round10(t.to, 1))}`);
    expect(en).toContain(`href="../../../${pathOf(p, "de")}" hreflang="de"`);
    expect(en).not.toMatch(/Richtwerte|Häufige|Tipps<|pro Person|Impressum/);
    expect(en).not.toMatch(/NaN|undefined/);
    expect(de).toContain(`href="../../${pathOf(p, "en")}" hreflang="en"`);
  });
  it("Link in die App: deutsche Reiseidee, englischer Name, eine Ebene tiefer", () => {
    for (const p of PAGES) {
      const href = planHref(p, "en");
      expect(href.startsWith("../../../?")).toBe(true);
      const plan = parsePlan(href.slice(href.indexOf("?")))!;
      expect(plan.idea).toBe(p.slug);
      expect(plan.name).toBe(EN[p.slug].name);
      expect(pageIn(p, "en").costs.map(c => c.from)).toEqual(p.costs.map(c => c.from));
    }
  });
  it("Übersicht und verwandte Seiten verlinken englische Adressen; App kennt die Ordner", () => {
    const idx = renderIndex(PAGES, undefined, "en");
    for (const p of PAGES) expect(idx).toContain(`href="${EN[p.slug].slug}/"`);
    const p = PAGES[0], en = renderPage(p, PAGES, undefined, "en");
    for (const r of p.related) expect(en).toContain(`href="../${EN[r].slug}/"`);
    expect(ideasDir("de")).toBe(DIR.de);
    for (const l of ["en", "es", "ar"]) expect(ideasDir(l)).toBe(DIR.en);
  });
});
