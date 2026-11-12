/*
 * Größen der gebauten App als Tabelle (Markdown), für die Zusammenfassung des Prüflaufs (pruefen.yml).
 * Zählt, was der Browser lädt: komprimiert (gzip). Über dem Richtwert für den Start-Chunk nur eine Warnung
 * (::warning), kein Fehler: der Bericht soll Wachstum sichtbar machen, nicht blockieren.
 *
 *   node scripts/groessen.mjs app/dist
 */
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

/** Richtwert für den Start-Chunk (main-….js), komprimiert, in kB. Stand November 2026: 410 kB. */
export const START_KB = 450;

const kb = n => Math.round(n / 1024);
/** Name ohne den Hash des Builds: main-B6cJjZxe.js → main.js */
export const plain = f => f.replace(/-[\w-]{8}(\.\w+)$/, "$1");

export function sizes(dir) {
  const assets = join(dir, "assets");
  return readdirSync(assets).filter(f => /\.(js|css)$/.test(f)).map(f => {
    const buf = readFileSync(join(assets, f));
    return { name: plain(f), raw: buf.length, gzip: gzipSync(buf).length };
  }).sort((a, b) => b.gzip - a.gzip);
}

export function report(list, limit = START_KB) {
  const big = list.filter(x => x.gzip >= 20 * 1024), rest = list.filter(x => x.gzip < 20 * 1024);
  const sum = xs => xs.reduce((a, x) => a + x.gzip, 0);
  const lines = ["### Größen der App", "", "| Datei | gzip | roh |", "| --- | ---: | ---: |",
    ...big.map(x => `| \`${x.name}\` | ${kb(x.gzip)} kB | ${kb(x.raw)} kB |`),
    `| ${rest.length} weitere unter 20 kB | ${kb(sum(rest))} kB | |`,
    `| **gesamt** | **${kb(sum(list))} kB** | |`, ""];
  const start = list.find(x => /^main\.js$/.test(x.name));
  const over = !!start && kb(start.gzip) > limit;
  if (start) lines.push(`Start-Chunk \`main.js\`: ${kb(start.gzip)} kB (Richtwert ${limit} kB)${over ? " – darüber" : ""}.`);
  return { text: lines.join("\n"), over, start: start ? kb(start.gzip) : 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error("Aufruf: groessen.mjs <dist-Ordner>"); process.exit(2); }
  const r = report(sizes(dir));
  console.log(r.text);
  if (r.over) console.error(`::warning::Start-Chunk main.js ist ${r.start} kB (gzip), Richtwert ${START_KB} kB`);
}
