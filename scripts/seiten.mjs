// Inhaltsseiten (/reise/…, #314) aus app/src/lib/seo/pages.ts erzeugen und in die Sitemap eintragen,
// dazu die englische Fassung unter /en/trip-ideas/… (Texte in app/src/lib/seo/pages.en.ts).
// Aufruf aus scripts/site.sh: node --experimental-strip-types scripts/seiten.mjs <Zielordner>
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DIR, PAGES, pathOf, renderIndex, renderPage, sitemapUrls } from "../app/src/lib/seo/pages.ts";
import { artSvg } from "../app/src/lib/seo/art.ts";

const out = process.argv[2];
if (!out) throw new Error("Zielordner fehlt");
for (const lang of ["de", "en"]) {
  mkdirSync(join(out, DIR[lang]), { recursive: true });
  writeFileSync(join(out, DIR[lang], "index.html"), renderIndex(PAGES, artSvg, lang));
  for (const p of PAGES) {
    mkdirSync(join(out, pathOf(p, lang)), { recursive: true });
    writeFileSync(join(out, pathOf(p, lang), "index.html"), renderPage(p, PAGES, artSvg, lang));
  }
}
const sm = join(out, "sitemap.xml");
if (existsSync(sm)) {
  const urls = sitemapUrls(PAGES).map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n");
  writeFileSync(sm, readFileSync(sm, "utf8").replace("</urlset>", `${urls}\n</urlset>`));
}
console.log(`Inhaltsseiten: ${PAGES.length} je Sprache unter ${out}/reise/ und ${out}/en/trip-ideas/`);
