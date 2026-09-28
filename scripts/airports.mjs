/*
 * Flughafendaten für die Auswahl in der App erzeugen: public/airports.json
 * Quelle: OurAirports (gemeinfrei, täglich aktualisiert). Läuft bei jedem Deploy und einmal pro Woche
 * (GitHub Actions). Klappt der Abruf nicht, bleibt die Datei im Projekt unverändert.
 *
 *   node scripts/airports.mjs            aus dem Netz
 *   node scripts/airports.mjs a.csv      aus einer Datei (Test)
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv";
const OUT = new URL("../public/airports.json", import.meta.url);

/*
 * Städte mit mehreren Flughäfen und eigenem Stadt-Code (IATA „metropolitan area“).
 * Die Suche läuft dann über alle diese Flughäfen, außer man wählt ausdrücklich einen.
 * [Code, deutscher Name, englischer Name, Land, Flughäfen]
 */
export const METROS = [
  ["NYC", "New York", "New York", "US", ["JFK", "EWR", "LGA"]],
  ["TYO", "Tokio", "Tokyo", "JP", ["HND", "NRT"]],
  ["LON", "London", "London", "GB", ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"]],
  ["PAR", "Paris", "Paris", "FR", ["CDG", "ORY", "BVA"]],
  ["MIL", "Mailand", "Milan", "IT", ["MXP", "LIN", "BGY"]],
  ["ROM", "Rom", "Rome", "IT", ["FCO", "CIA"]],
  ["VCE", "Venedig", "Venice", "IT", ["VCE", "TSF"]],
  ["BRU", "Brüssel", "Brussels", "BE", ["BRU", "CRL"]],
  ["STO", "Stockholm", "Stockholm", "SE", ["ARN", "BMA", "NYO", "VST"]],
  ["OSL", "Oslo", "Oslo", "NO", ["OSL", "TRF", "RYG"]],
  ["REK", "Reykjavík", "Reykjavik", "IS", ["KEF", "RKV"]],
  ["BUH", "Bukarest", "Bucharest", "RO", ["OTP", "BBU"]],
  ["IST", "Istanbul", "Istanbul", "TR", ["IST", "SAW"]],
  ["TCI", "Teneriffa", "Tenerife", "ES", ["TFS", "TFN"]],
  ["MOW", "Moskau", "Moscow", "RU", ["SVO", "DME", "VKO", "ZIA"]],
  ["GLA", "Glasgow", "Glasgow", "GB", ["GLA", "PIK"]],
  ["BFS", "Belfast", "Belfast", "GB", ["BFS", "BHD"]],
  ["CHI", "Chicago", "Chicago", "US", ["ORD", "MDW"]],
  ["WAS", "Washington", "Washington", "US", ["IAD", "DCA", "BWI"]],
  ["HOU", "Houston", "Houston", "US", ["IAH", "HOU"]],
  ["DFW", "Dallas", "Dallas", "US", ["DFW", "DAL"]],
  ["ORL", "Orlando", "Orlando", "US", ["MCO", "SFB"]],
  ["YTO", "Toronto", "Toronto", "CA", ["YYZ", "YTZ"]],
  ["YMQ", "Montreal", "Montreal", "CA", ["YUL", "YMX"]],
  ["MEX", "Mexiko-Stadt", "Mexico City", "MX", ["MEX", "NLU"]],
  ["SAO", "São Paulo", "Sao Paulo", "BR", ["GRU", "CGH", "VCP"]],
  ["RIO", "Rio de Janeiro", "Rio de Janeiro", "BR", ["GIG", "SDU"]],
  ["BUE", "Buenos Aires", "Buenos Aires", "AR", ["EZE", "AEP"]],
  ["SEL", "Seoul", "Seoul", "KR", ["ICN", "GMP"]],
  ["OSA", "Osaka", "Osaka", "JP", ["KIX", "ITM", "UKB"]],
  ["SPK", "Sapporo", "Sapporo", "JP", ["CTS", "OKD"]],
  ["NGO", "Nagoya", "Nagoya", "JP", ["NGO", "NKM"]],
  ["BJS", "Peking", "Beijing", "CN", ["PEK", "PKX"]],
  ["SHA", "Shanghai", "Shanghai", "CN", ["PVG", "SHA"]],
  ["CTU", "Chengdu", "Chengdu", "CN", ["TFU", "CTU"]],
  ["BKK", "Bangkok", "Bangkok", "TH", ["BKK", "DMK"]],
  ["JKT", "Jakarta", "Jakarta", "ID", ["CGK", "HLP"]],
  ["DXB", "Dubai", "Dubai", "AE", ["DXB", "DWC"]],
  ["THR", "Teheran", "Tehran", "IR", ["IKA", "THR"]],
  ["JNB", "Johannesburg", "Johannesburg", "ZA", ["JNB", "HLA"]]
];

/** CSV mit Anführungszeichen (OurAirports) in Zeilen aus Feldern */
export function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.length > 1) rows.push(row);
      row = [];
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const short = n => n.replace(/\s+(International\s+)?Airport$/i, "").replace(/\s+Airport\b/i, "").trim();
// „Köln (Cologne)“, „London, Essex“, „Ferno (VA)“ → erster Teil
const cityOf = m => m.split(/[,(]/)[0].trim();

/** deutsche Ortsnamen aus den Daten des Artefakts (world.json, packs.json), nach Land und englischem Namen */
function germanNames(world, packs) {
  const de = new Map();
  for (const c of world?.countries || []) for (const [n, , , en] of c.cities || []) if (en && en !== n) de.set(`${c.k}|${norm(en)}`, n);
  for (const [k, p] of Object.entries(packs || {})) for (const c of p.cities || []) if (c.en && c.en !== c.n) de.set(`${k}|${norm(c.en)}`, c.n);
  return de;
}

export function build(csv, { world, packs, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const [head, ...rows] = parseCsv(csv);
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const de = germanNames(world, packs);
  const seen = new Set();
  const airports = [];
  for (const r of rows) {
    const iata = r[col.iata_code]?.trim();
    if (!/^[A-Z]{3}$/.test(iata) || seen.has(iata)) continue;
    if (r[col.scheduled_service] !== "yes" || !/^(large|medium|small)_airport$/.test(r[col.type])) continue;
    seen.add(iata);
    const cc = r[col.iso_country], en = cityOf(r[col.municipality] || "") || short(r[col.name]);
    const city = de.get(`${cc}|${norm(en)}`) || en;
    // Suchbegriffe: englischer Ort, falls der deutsche anders heißt, und Stichwörter ohne alte Codes
    const kw = [city !== en ? en : "", ...(r[col.keywords] || "").split(/[,;]\s*/)]
      .map(s => s.trim()).filter(s => s && !/^[A-Z0-9]{3,4}$/.test(s) && !/[^\u0000-ɏ]/.test(s)).slice(0, 4).join(", ");
    const size = r[col.type][0]; // l, m, s
    airports.push([iata, short(r[col.name]), city, cc, +(+r[col.latitude_deg]).toFixed(3), +(+r[col.longitude_deg]).toFixed(3), size, kw]);
  }
  airports.sort((a, b) => ("lms".indexOf(a[6]) - "lms".indexOf(b[6])) || a[0].localeCompare(b[0]));
  // Städte nur mit Flughäfen, die es noch gibt; mit weniger als zwei bleibt der Flughafen allein
  const cities = METROS.map(([code, n, en, cc, aps]) => [code, n, en, cc, aps.filter(a => seen.has(a))]).filter(c => c[4].length > 1);
  return { asOf, src: "OurAirports (ourairports.com, gemeinfrei)", airports, cities };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const file = process.argv[2];
  const csv = file ? readFileSync(file, "utf8") : await fetch(SRC).then(r => { if (!r.ok) throw new Error(`OurAirports: ${r.status}`); return r.text(); });
  const read = f => { try { return JSON.parse(readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8")); } catch { return null; } };
  const data = build(csv, { world: read("world.json"), packs: read("packs.json") });
  // Plausibilität: lieber alte Daten behalten als eine kaputte Liste ausliefern
  if (data.airports.length < 2000) throw new Error(`nur ${data.airports.length} Flughäfen, Datei bleibt unverändert`);
  writeFileSync(OUT, JSON.stringify(data));
  console.log(`${data.airports.length} Flughäfen, ${data.cities.length} Städte mit mehreren Flughäfen → public/airports.json`);
}
