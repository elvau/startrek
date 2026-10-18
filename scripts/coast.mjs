/*
 * Küstenlinie für „Entfernung zum Strand“ (#441): public/coast/{B}_{L}.json je 10°-Block
 * Quelle: Natural Earth 1:10 Mio., Küstenlinien (gemeinfrei). Genauigkeit etwa 1 km, für „am Meer“ bzw.
 * „x km zum Meer“ reicht das; die App zeigt unter 1 km nur „unter 1 km“.
 *
 *   node scripts/coast.mjs [Pfad zur ne_10m_coastline.geojson]   ohne Pfad: wird heruntergeladen
 *
 * Ohne Polargebiete (nördlich 66°, südlich 56° Süd).
 *
 * Format: { source, cells: { "39_2": [3951, 274, 3952, 275, …] } } – Punkte auf 0,01° gerundet (×100),
 * Strecken vorher so aufgefüllt, dass zwischen zwei Punkten höchstens 0,01° liegen; Zelle = 1° × 1°.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const URL_NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson";
const OUT = new URL("../public/coast/", import.meta.url);
const src = process.argv[2];
const geo = src ? JSON.parse(readFileSync(src, "utf8")) : await (await fetch(URL_NE)).json();

const cells = new Map();
const add = (lat, lon) => {
  // Polargebiete (Grönland, Kanada-Arktis, Antarktis) brauchen keine Strände, sparen aber die Hälfte der Daten
  if (lat > 66 || lat < -56) return;
  const a = Math.round(lat * 100), o = Math.round(lon * 100);
  const k = `${Math.floor(a / 100)}_${Math.floor(o / 100)}`;
  let s = cells.get(k);
  if (!s) cells.set(k, (s = new Set()));
  s.add(a * 100000 + o);
};
for (const f of geo.features) {
  const lines = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const [lon, lat] = line[i];
      add(lat, lon);
      if (i + 1 < line.length) {
        const [lon2, lat2] = line[i + 1];
        const n = Math.ceil(Math.max(Math.abs(lat2 - lat), Math.abs(lon2 - lon)) / 0.01);
        for (let j = 1; j < n; j++) add(lat + ((lat2 - lat) * j) / n, lon + ((lon2 - lon) * j) / n);
      }
    }
  }
}

const blocks = new Map();
for (const [k, s] of cells) {
  const [la, lo] = k.split("_").map(Number);
  const b = `${Math.floor(la / 10) * 10}_${Math.floor(lo / 10) * 10}`;
  if (!blocks.has(b)) blocks.set(b, {});
  blocks.get(b)[k] = [...s].sort((x, y) => x - y).flatMap(v => { const a = Math.round(v / 100000); return [a, v - a * 100000]; });
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [b, c] of blocks) {
  const txt = JSON.stringify({ source: "Natural Earth 1:10m coastline (public domain)", cells: c });
  writeFileSync(new URL(`${b}.json`, OUT), txt);
  bytes += txt.length;
}
console.log(`${cells.size} Zellen in ${blocks.size} Dateien, ${(bytes / 1e6).toFixed(1)} MB`);
