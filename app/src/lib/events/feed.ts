/*
 * Sportkalender automatisch ergänzen: public/sports.json aus offenen Quellen, erzeugt von scripts/sports.mjs beim Deploy.
 * - Formel 1: Jolpica (api.jolpi.ca, Nachfolger der Ergast-Schnittstelle), Rennkalender dieses und nächstes Jahr
 * - große Sportevents: Wikidata (CC0), Weltmeisterschaften, Turniere usw. mit Datum, Ort und mindestens einigen Wikipedia-Artikeln
 * Die kuratierte Liste (sports.ts) gewinnt bei Doppelten; Anmeldung für alle kennt nur sie.
 * Ohne Laufzeit-Importe, damit das Skript die Datei direkt mit Node laden kann.
 */
import type { Sport, SportEvent } from "./sports";

export interface SportFeed { asOf?: string; source?: string; events: SportEvent[] }

/** Sportart aus der englischen Bezeichnung (Wikidata); Fußball null (kommt über football-data.org), Unbekanntes „other“ */
export function sportOf(label: string): Sport | "other" | null {
  const l = label.toLowerCase();
  if (/^(association )?football$|futsal|beach soccer|soccer/.test(l)) return null;
  const R: [RegExp, Sport][] = [
    [/american football|gridiron/, "nfl"], [/triathlon|duathlon/, "tri"], [/marathon|running|road running|trail/, "run"],
    [/athletics|track and field/, "athletics"], [/tennis/, "tennis"], [/golf/, "golf"], [/ice hockey/, "hockey"], [/handball/, "hand"],
    [/rugby/, "rugby"], [/basketball/, "basket"], [/cycl|bicycle|bmx|mountain bik/, "bike"],
    [/ski|biathlon|snowboard|bobsleigh|luge|skeleton|curling|speed skating|figure skating|nordic combined/, "ski"],
    [/formula|motor|racing|rally|motorcycle|karting|endurance/, "motor"], [/darts/, "darts"], [/multi-sport|olympic/, "multi"]
  ];
  return R.find(([re]) => re.test(l))?.[1] ?? "other";
}

/** Länder der Formel-1-Strecken (Jolpica nennt sie ausgeschrieben) */
const F1_CC: Record<string, string> = {
  Australia: "AU", China: "CN", Japan: "JP", Bahrain: "BH", "Saudi Arabia": "SA", USA: "US", "United States": "US", Italy: "IT", Monaco: "MC",
  Spain: "ES", Canada: "CA", Austria: "AT", UK: "GB", "United Kingdom": "GB", Hungary: "HU", Belgium: "BE", Netherlands: "NL", Azerbaijan: "AZ",
  Singapore: "SG", Mexico: "MX", Brazil: "BR", Qatar: "QA", UAE: "AE", "United Arab Emirates": "AE", Portugal: "PT", Turkey: "TR", Germany: "DE",
  France: "FR", Argentina: "AR", "South Africa": "ZA", Korea: "KR", India: "IN", Malaysia: "MY", Russia: "RU", Vietnam: "VN", Thailand: "TH",
  Morocco: "MA", Rwanda: "RW"
};
const day = (iso: string, add: number) => new Date(Date.parse(iso) + add * 86400000).toISOString().slice(0, 10);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Jolpica/Ergast: ein Rennwochenende je Lauf, vom ersten Training bis zum Rennen */
export function fromJolpica(data: any): SportEvent[] {
  const races: any[] = data?.MRData?.RaceTable?.Races || [];
  return races.map(r => {
    const loc = r.Circuit?.Location || {}, lat = Number(loc.lat), lon = Number(loc.long);
    const date = String(r.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFinite(lat) || !isFinite(lon)) return null;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(r.FirstPractice?.date || "") ? r.FirstPractice.date : day(date, -2);
    const name = String(r.raceName || "Grand Prix");
    return {
      id: `f1-${r.season}-${r.round}`, name: `F1 ${name} ${r.season}`, de: `Formel 1: ${name} ${r.season}`, sport: "motor" as const,
      start, ...(start < date ? { end: date } : {}), city: String(loc.locality || ""), cc: F1_CC[loc.country] || "", lat, lon,
      ...(r.Circuit?.circuitName ? { venue: String(r.Circuit.circuitName) } : {}), url: String(r.url || "https://www.formula1.com/"), words: "formel 1 formula 1 f1 grand prix"
    };
  }).filter((e): e is NonNullable<typeof e> => !!e && !!e.city);
}

/** Wikidata: Sportevents mit Sportart (P641), Beginn (P580) im Zeitraum, Koordinaten am Event, Ort oder dessen Verwaltungseinheit */
export function wikidataQuery(from: string, to: string, minLinks = 8): string {
  return `SELECT ?e ?en ?de ?start ?end ?sportEn ?c0 ?c1 ?c2 ?locEn ?locDe ?cc ?links ?wpEn ?wpDe WHERE {
  ?e wdt:P641 ?sport ; wdt:P580 ?start ; wikibase:sitelinks ?links .
  FILTER(?start >= "${from}T00:00:00Z"^^xsd:dateTime && ?start < "${to}T00:00:00Z"^^xsd:dateTime && ?links >= ${minLinks})
  ?sport rdfs:label ?sportEn . FILTER(LANG(?sportEn) = "en")
  OPTIONAL { ?e wdt:P582 ?end }
  OPTIONAL { ?e wdt:P625 ?c0 }
  OPTIONAL { ?e wdt:P276 ?loc .
    OPTIONAL { ?loc wdt:P625 ?c1 }
    OPTIONAL { ?loc wdt:P131 ?adm . ?adm wdt:P625 ?c2 }
    OPTIONAL { ?loc rdfs:label ?locEn . FILTER(LANG(?locEn) = "en") }
    OPTIONAL { ?loc rdfs:label ?locDe . FILTER(LANG(?locDe) = "de") } }
  OPTIONAL { ?e wdt:P17 ?country . ?country wdt:P297 ?cc }
  OPTIONAL { ?e rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?e rdfs:label ?de . FILTER(LANG(?de) = "de") }
  OPTIONAL { ?wpEn schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?wpDe schema:about ?e ; schema:isPartOf <https://de.wikipedia.org/> }
} LIMIT 3000`;
}

/** „Point(13.4 52.5)“ → Breite, Länge */
const point = (wkt?: string) => {
  const m = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(wkt || "");
  return m ? { lon: Number(m[1]), lat: Number(m[2]) } : null;
};

/** SPARQL-Ergebnis → Events (eine Zeile je Kombination, je Event die erste brauchbare); Teilwettbewerbe fallen weg */
export function fromWikidata(json: any): SportEvent[] {
  const rows: any[] = json?.results?.bindings || [];
  const out = new Map<string, SportEvent>();
  for (const r of rows) {
    const v = (k: string): string | undefined => r[k]?.value;
    const id = (v("e") || "").split("/").pop() || "";
    if (!id || out.has(id)) continue;
    const name = v("en") || v("de");
    const sport = sportOf(v("sportEn") || "");
    const at = point(v("c0")) || point(v("c1")) || point(v("c2"));
    const start = (v("start") || "").slice(0, 10), end = (v("end") || "").slice(0, 10);
    // „Athletics at the 2028 Summer Olympics“, „… – Men's 100 metres“: Teil eines größeren Events
    if (!name || !sport || !at || !/^\d{4}-\d{2}-\d{2}$/.test(start) || /\bat the \d{4}\b| – |—/i.test(name)) continue;
    const city = v("locDe") || v("locEn") || "";
    out.set(id, {
      id: `wd-${id}`, name, ...(v("de") && v("de") !== name ? { de: v("de") } : {}), sport: sport as Sport, start,
      ...(end > start ? { end } : {}), city, cc: (v("cc") || "").toUpperCase(), lat: at.lat, lon: at.lon,
      url: v("wpDe") || v("wpEn") || `https://www.wikidata.org/wiki/${id}`
    });
  }
  return [...out.values()];
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/** gleiches Event: gleiche Sportart (oder „other“), Beginn höchstens 3 Tage auseinander, Orte höchstens 150 km */
const same = (a: SportEvent, b: SportEvent) =>
  (a.sport === b.sport || (a.sport as string) === "other" || (b.sport as string) === "other") && daysApart(a.start, b.start) <= 3 && km(a, b) <= 150;

/** kuratierte Liste plus Feed; Doppelte (auch innerhalb des Feeds) fallen weg, die kuratierte Fassung bleibt */
export function mergeFeed(curated: SportEvent[], feed: SportEvent[]): SportEvent[] {
  const out = [...curated];
  for (const e of feed) if (!out.some(c => same(c, e))) out.push(e);
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** bis wann reicht die kuratierte Liste (letzter Beginn ohne Olympia, das steht Jahre vorher fest)? */
export const horizon = (curated: SportEvent[]) => curated.filter(e => e.sport !== "multi").map(e => e.start).sort().at(-1) || "";
