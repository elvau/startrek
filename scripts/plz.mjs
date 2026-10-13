/*
 * Postleitzahlen für Wohnorte außerhalb Deutschlands (#163, Entscheidung #335): app/public/plz/<LAND>.txt und index.json
 * Quelle: GeoNames Postal Codes (download.geonames.org/export/zip, CC BY 4.0; GB mit Royal-Mail-Hinweis, nur äußerer Teil
 * der Postleitzahl). Deutschland bleibt app/public/plz.txt. Nur europäische Länder, sonst wählt man den Ort aus der Ortsliste.
 *
 *   node scripts/plz.mjs <Ordner mit entpackten LAND.txt>
 *
 * Format je Land: eine Zeile je PLZ und Ort „PLZ<TAB>Ort<TAB>Breite<TAB>Länge“ (3 Nachkommastellen), sortiert nach PLZ.
 * Portugal hat siebenstellige PLZ bis auf die Straße (über 200.000): dort nur die ersten vier Ziffern (die App kürzt die
 * Eingabe genauso).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const EUROPE = ["AD", "AT", "AX", "BE", "BG", "CH", "CY", "CZ", "DK", "EE", "ES", "FI", "FO", "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE", "IM", "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SJ", "SK", "SM", "UA", "VA"];
const OUT = new URL("../app/public/plz/", import.meta.url);
const dir = process.argv[2];
if (!dir) throw new Error("Ordner fehlt");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

/** PLZ kürzen, wo die Liste sonst zu groß wird */
export const SHORT = { PT: c => c.split("-")[0] };
const index = {};
for (const cc of EUROPE) {
  const f = join(dir, `${cc}.txt`);
  if (!existsSync(f)) { console.log(`${cc}: keine Datei`); continue; }
  const seen = new Set(), rows = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const c = line.split("\t");
    if (c.length < 11) continue;
    const code = (SHORT[cc] || (x => x))(c[1].trim()), ort = c[2].trim(), lat = Number(c[9]), lon = Number(c[10]);
    if (!code || !ort || !isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const k = `${code}\t${ort}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push([code, ort, lat.toFixed(3), lon.toFixed(3)]);
  }
  if (rows.length < 5) { console.log(`${cc}: zu wenige (${rows.length})`); continue; }
  rows.sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }) || a[1].localeCompare(b[1]));
  const txt = rows.map(r => r.join("\t")).join("\n") + "\n";
  writeFileSync(new URL(`${cc}.txt`, OUT), txt);
  index[cc] = rows.length;
  console.log(`${cc}: ${rows.length} (${Math.round(txt.length / 1024)} KB)`);
}
writeFileSync(new URL("index.json", OUT), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), source: "GeoNames (CC BY 4.0)", countries: index }));
