/*
 * Einreise je Staatsangehörigkeit für die App erzeugen: public/visa.json
 * Quelle: Passport Index Data (github.com/imorte/passport-index-data, MIT), Matrix mit ISO-2-Codes.
 * Läuft bei jedem Deploy wie die Flughafendaten; klappt der Abruf nicht, bleibt die Datei im Projekt.
 *
 *   node scripts/visa.mjs            aus dem Netz
 *   node scripts/visa.mjs m.csv      aus einer Datei
 *
 * Format: { asOf, cc: [Länder], m: { Pass: "Zeile" } } – je Zielland ein Wert, durch „,“ getrennt:
 * Zahl = visumfrei so viele Tage, f = visumfrei, t = elektronische Reisegenehmigung (eta), e = e-Visum,
 * a = Visum bei Ankunft, r = Visum vorab, x = keine Einreise, leer = eigenes Land.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/imorte/passport-index-data/main/passport-index-matrix-iso2.csv";
const OUT = new URL("../public/visa.json", import.meta.url);
const CODE = { "visa free": "f", "eta": "t", "e-visa": "e", "visa on arrival": "a", "visa required": "r", "no admission": "x", "-1": "" };

const file = process.argv[2];
const csv = file ? readFileSync(file, "utf8") : await (await fetch(SRC)).text();
const rows = csv.trim().split(/\r?\n/).map(l => l.split(","));
const [head, ...body] = rows;
const cc = head.slice(1);
if (cc.length < 150 || body.length < 150) throw new Error(`zu wenige Länder (${cc.length} × ${body.length})`);
const m = {};
for (const r of body) m[r[0]] = r.slice(1).map(v => (v in CODE ? CODE[v] : /^\d+$/.test(v) ? v : "?")).join(",");
writeFileSync(OUT, JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), source: "Passport Index Data (MIT)", cc, m }));
console.log(`${body.length} Pässe × ${cc.length} Länder → public/visa.json`);
