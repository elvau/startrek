// Anleitung (/anleitung/…) aus app/src/lib/guide/pages.ts erzeugen und in die Sitemap eintragen.
// Aufruf aus scripts/site.sh: node --experimental-strip-types scripts/anleitung.mjs <Zielordner>
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { GUIDE, renderGuideIndex, renderGuidePage, guideSitemapUrls } from "../app/src/lib/guide/pages.ts";
import { guideArtSvg } from "../app/src/lib/guide/art.ts";

const SHOTS = new URL("../app/src/lib/guide/shots/", import.meta.url);
const spots = JSON.parse(readFileSync(new URL("spots.json", SHOTS), "utf8"));
const out = process.argv[2];
if (!out) throw new Error("Zielordner fehlt");
mkdirSync(join(out, "anleitung"), { recursive: true });
writeFileSync(join(out, "anleitung", "index.html"), renderGuideIndex(GUIDE, guideArtSvg));
for (const p of GUIDE) {
  mkdirSync(join(out, "anleitung", p.slug), { recursive: true });
  writeFileSync(join(out, "anleitung", p.slug, "index.html"), renderGuidePage(p, GUIDE, guideArtSvg, spots));
}
// Screenshots der App (siehe app/e2e/anleitung-shots.mjs)
mkdirSync(join(out, "anleitung", "img"), { recursive: true });
for (const f of readdirSync(SHOTS)) if (f.endsWith(".jpg")) copyFileSync(new URL(f, SHOTS), join(out, "anleitung", "img", f));
const sm = join(out, "sitemap.xml");
if (existsSync(sm)) {
  const urls = guideSitemapUrls(GUIDE).map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n");
  writeFileSync(sm, readFileSync(sm, "utf8").replace("</urlset>", `${urls}\n</urlset>`));
}
console.log(`Anleitung: ${GUIDE.length} Seiten unter ${out}/anleitung/`);
