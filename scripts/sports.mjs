/*
 * Sportkalender ergänzen: public/sports.json (Formel 1 von Jolpica, große Sportevents von Wikidata, CC0).
 * Läuft bei jedem Deploy wie die Flughafen- und Einreisedaten; klappt eine Quelle nicht, bleibt die andere,
 * klappen beide nicht, bleibt die alte Datei. Meldet, wenn die kuratierte Liste (sports.ts) bald endet.
 *
 *   node scripts/sports.mjs
 *
 * Die Logik steht in app/src/lib/events/feed.ts (mit Tests); Node lädt die TypeScript-Dateien direkt.
 */
import { existsSync, writeFileSync } from "node:fs";
import { fromJolpica, fromWikidata, horizon, mergeFeed, wikidataQuery } from "../app/src/lib/events/feed.ts";
import { SPORTS } from "../app/src/lib/events/sports.ts";

const OUT = new URL("../public/sports.json", import.meta.url);
const UA = { "user-agent": "SplitAndFly/1.0 (https://splitandfly.com; Sportkalender)", accept: "application/json" };
const today = new Date().toISOString().slice(0, 10);
const year = +today.slice(0, 4);
const until = `${year + 3}${today.slice(4)}`;
const warn = m => console.log(`::warning::${m}`);

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...UA, ...init.headers }, signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const f1 = [];
for (const y of [year, year + 1]) {
  try { f1.push(...fromJolpica(await get(`https://api.jolpi.ca/ergast/f1/${y}.json?limit=100`))); }
  catch (e) { warn(`Formel 1 ${y} nicht geladen: ${e.message}`); }
}
let wd = [];
try {
  const q = wikidataQuery(today, until);
  wd = fromWikidata(await get("https://query.wikidata.org/sparql", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/sparql-results+json" }, body: new URLSearchParams({ query: q }) }));
} catch (e) { warn(`Wikidata nicht geladen: ${e.message}`); }

const events = mergeFeed([], [...f1, ...wd]).filter(e => (e.end || e.start) >= today);
if (!events.length) {
  warn("Sportkalender nicht aktualisiert, " + (existsSync(OUT) ? "alte Datei bleibt" : "keine Datei"));
} else {
  writeFileSync(OUT, JSON.stringify({ asOf: today, source: "Jolpica F1, Wikidata (CC0)", events }));
  console.log(`${f1.length} Formel-1-Rennen, ${wd.length} Events aus Wikidata → public/sports.json (${events.length}, ${mergeFeed(SPORTS, events).length - SPORTS.length} neu zur Liste)`);
}

// kuratierte Liste: reicht sie noch mindestens ein halbes Jahr?
const end = horizon(SPORTS);
const soon = new Date(Date.now() + 182 * 86400000).toISOString().slice(0, 10);
if (end < soon) warn(`Sportkalender (app/src/lib/events/sports.ts) endet am ${end}: neue Termine eintragen`);
else console.log(`kuratierte Liste reicht bis ${end}`);
