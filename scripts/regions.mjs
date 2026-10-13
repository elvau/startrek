/*
 * Regionen für Schulferien je Land (#163, Entscheidung #335): app/public/regions.json
 * Quelle: OpenHolidays API (openholidaysapi.org, ODbL). Länder mit Schulferien und ihre Regionen (Bundesland, Kanton …)
 * mit Namen in den Sprachen der App, soweit die Quelle sie hat. Die Termine selbst holt der Such-Dienst (/holidays).
 *
 *   node scripts/regions.mjs           schreibt die Datei
 *   node scripts/regions.mjs --probe   zeigt zusätzlich Beispiele der Antworten (Aufbau prüfen)
 *
 * Format: { asOf, source, countries: { AT: [{ code: "AT-9", n: { de: "Wien", en: "Vienna" } }] } }
 */
import { writeFileSync } from "node:fs";

const API = "https://openholidaysapi.org";
const LANGS = ["de", "en", "es", "fr", "pl", "ru", "ar"];
const OUT = new URL("../app/public/regions.json", import.meta.url);
const get = async p => { const r = await fetch(API + p, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); };
const names = arr => Object.fromEntries((arr || []).map(x => [String(x.language || "").toLowerCase(), x.text]).filter(([l, t]) => LANGS.includes(l) && t));

const countries = await get("/Countries");
console.log(`${countries.length} Länder: ${countries.map(c => c.isoCode).join(" ")}`);
const out = {};
for (const c of countries) {
  const cc = c.isoCode;
  let subs = [];
  try { subs = await get(`/Subdivisions?countryIsoCode=${cc}`); } catch (e) { console.log(`${cc}: ${e.message}`); }
  // nur oberste Ebene (Bundesland, Kanton …), darunter liegende (Kreise) weglassen
  const top = subs.map(s => ({ code: s.code, n: names(s.name), cat: s.category?.[0]?.text }));
  out[cc] = top.filter(s => s.code).map(({ code, n }) => ({ code, n }));
  console.log(`${cc}: ${out[cc].length} Regionen (${[...new Set(top.map(s => s.cat))].join(", ")})`);
}
if (process.argv.includes("--probe")) {
  const y = new Date().getFullYear();
  const s = await get(`/SchoolHolidays?countryIsoCode=AT&validFrom=${y}-01-01&validTo=${y}-12-31&languageIsoCode=DE`);
  console.log("SchoolHolidays AT:", JSON.stringify(s.slice(0, 2)), `(${s.length})`);
  const p = await get(`/PublicHolidays?countryIsoCode=DE&validFrom=${y}-01-01&validTo=${y}-12-31&languageIsoCode=DE`);
  console.log("PublicHolidays DE:", JSON.stringify(p.filter(x => !x.nationwide).slice(0, 1)), JSON.stringify(p.slice(0, 1)), `(${p.length})`);
  const sub = await get(`/Subdivisions?countryIsoCode=AT`);
  console.log("Subdivisions AT:", JSON.stringify(sub.slice(0, 1)).slice(0, 800));
}
writeFileSync(OUT, JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), source: "OpenHolidays API (ODbL)", countries: out }));
