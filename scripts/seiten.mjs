// Inhaltsseiten (/reise/…, #314) aus app/src/lib/seo/pages.ts erzeugen und in die Sitemap eintragen.
// Aufruf aus scripts/site.sh: node --experimental-strip-types scripts/seiten.mjs <Zielordner>
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PAGES, renderIndex, renderPage, sitemapUrls } from "../app/src/lib/seo/pages.ts";
import { artSvg } from "../app/src/lib/seo/art.ts";

const out = process.argv[2];
if (!out) throw new Error("Zielordner fehlt");
mkdirSync(join(out, "reise"), { recursive: true });
writeFileSync(join(out, "reise", "index.html"), renderIndex(PAGES, artSvg));
for (const p of PAGES) {
  mkdirSync(join(out, "reise", p.slug), { recursive: true });
  writeFileSync(join(out, "reise", p.slug, "index.html"), renderPage(p, PAGES, artSvg));
}
const sm = join(out, "sitemap.xml");
if (existsSync(sm)) {
  const urls = sitemapUrls(PAGES).map(u => `  <url><loc>${u}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n");
  writeFileSync(sm, readFileSync(sm, "utf8").replace("</urlset>", `${urls}\n</urlset>`));
}
console.log(`Inhaltsseiten: ${PAGES.length} unter ${out}/reise/`);
