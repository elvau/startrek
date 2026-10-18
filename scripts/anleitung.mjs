// Anleitung (/anleitung/…) aus app/src/lib/guide/pages.ts erzeugen und in die Sitemap eintragen.
// Aufruf aus scripts/site.sh: node --experimental-strip-types scripts/anleitung.mjs <Zielordner>
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GUIDE, renderGuideIndex, renderGuidePage, guideSitemapUrls } from "../app/src/lib/guide/pages.ts";
import { guideArtSvg } from "../app/src/lib/guide/art.ts";

const out = process.argv[2];
if (!out) throw new Error("Zielordner fehlt");
mkdirSync(join(out, "anleitung"), { recursive: true });
writeFileSync(join(out, "anleitung", "index.html"), renderGuideIndex(GUIDE, guideArtSvg));
for (const p of GUIDE) {
  mkdirSync(join(out, "anleitung", p.slug), { recursive: true });
  writeFileSync(join(out, "anleitung", p.slug, "index.html"), renderGuidePage(p, GUIDE, guideArtSvg));
}
const sm = join(out, "sitemap.xml");
if (existsSync(sm)) {
  const urls = guideSitemapUrls(GUIDE).map(u => `  <url><loc>${u}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`).join("\n");
  writeFileSync(sm, readFileSync(sm, "utf8").replace("</urlset>", `${urls}\n</urlset>`));
}
console.log(`Anleitung: ${GUIDE.length} Seiten unter ${out}/anleitung/`);
