import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import robots from "../../../public/robots.txt?raw";
import sitemap from "../../../public/sitemap.xml?raw";

// Rechtliches ist noindex; stünde es in der Sitemap, widerspräche sich das (Search Console: „Gecrawlt – zurzeit nicht indexiert“)
const LEGAL = import.meta.glob("../../../public/*.html", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// SEO-Grundlagen (#313): Meta-Angaben in index.html, robots.txt und Sitemap für splitandfly.com

describe("SEO", () => {
  it("index.html: Titel, Beschreibung, canonical, Open Graph, strukturierte Daten", () => {
    expect(html).toMatch(/<title>Split&amp;Fly – .+<\/title>/);
    const desc = html.match(/name="description" content="([^"]+)"/)?.[1] ?? "";
    expect(desc.length).toBeGreaterThan(80);
    expect(desc.length).toBeLessThanOrEqual(170);
    expect(html).toContain('rel="canonical" href="https://splitandfly.com/"');
    for (const p of ["og:title", "og:description", "og:url", "og:image"]) expect(html).toContain(`property="${p}"`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/)![1]);
    expect(ld["@type"]).toBe("WebApplication");
    expect(html).toContain("<noscript>");
  });
  it("robots.txt verweist auf die Sitemap, Sitemap enthält die Startseite", () => {
    expect(robots).toContain("Sitemap: https://splitandfly.com/sitemap.xml");
    expect(sitemap).toContain("<loc>https://splitandfly.com/</loc>");
  });
  it("Sitemap enthält keine Seite mit noindex", () => {
    const noindex = Object.entries(LEGAL).filter(([, src]) => src.includes('name="robots" content="noindex"')).map(([f]) => f.split("/").pop()!);
    expect(noindex).toContain("impressum.html");
    for (const f of noindex) expect(sitemap, f).not.toContain(`/${f}<`);
  });
});
