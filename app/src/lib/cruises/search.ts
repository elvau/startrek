/*
 * Kreuzfahrten suchen (#519): Ohne Partner mit Feed sucht die KI mit Websuche (Gemini: Google-Suche, Claude: web_search)
 * nach echten Fahrten und antwortet mit JSON. App und Such-Dienst übernehmen nur geprüfte Felder; Treffer ohne Link
 * zur Fundstelle, ohne Termin im gewünschten Zeitraum oder ohne Schiff bzw. Reederei fallen weg. Preise sind „ab“-Preise
 * von der Fundstelle, nicht live geprüft.
 */
import { CABIN_TYPES, type CabinType } from "../model";
import { parsePorts, type ImportPort } from "../import/ai";

export const CRUISE_AREAS = ["any", "med", "norway", "baltic", "atlantic", "caribbean", "orient", "asia", "river"] as const;
export type CruiseArea = (typeof CRUISE_AREAS)[number];
/** Fahrtgebiete für die Suchanfrage (Englisch, die KI übersetzt selbst) */
const AREA_TEXT: Record<CruiseArea, string> = {
  any: "any region", med: "Mediterranean", norway: "Norwegian fjords / Northern Europe", baltic: "Baltic Sea", atlantic: "Canary Islands / Atlantic islands",
  caribbean: "Caribbean", orient: "Arabian Gulf / Orient (Dubai)", asia: "Asia", river: "river cruise (Rhine, Danube, Nile …)"
};
const LANGS = ["de", "en", "es", "fr", "pl", "ru", "ar"] as const;
/** höchstens so viele Treffer zeigt die App */
export const CRUISE_HITS = 6;

export interface CruiseQuery {
  area: CruiseArea;
  /** Abfahrtshafen (frei, optional) */
  port?: string;
  /** Abfahrt frühestens / spätestens (JJJJ-MM-TT) */
  from: string;
  to: string;
  nightsMin?: number;
  nightsMax?: number;
  adults: number;
  childAges?: number[];
  cabin?: CabinType;
  lang: string;
}

export interface CruiseHit {
  id: string;
  line?: string;
  ship?: string;
  title?: string;
  from: string;
  to?: string;
  nights?: number;
  ports: ImportPort[];
  /** „ab“-Preis pro Person laut Fundstelle, Kabine dazu */
  price?: { perPerson: number; currency: string; cabin?: CabinType };
  url: string;
  /** Name der Seite, auf der die Fahrt steht */
  source: string;
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : undefined);
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Anfrage an den Such-Dienst prüfen; Fehlermeldung als Text */
export function parseCruiseQuery(body: unknown): CruiseQuery | string {
  const b = obj(body);
  const from = day(b.from), to = day(b.to);
  if (!from || !to) return "Zeitraum fehlt";
  if (to < from) return "Zeitraum ungültig";
  if (Date.parse(to) - Date.parse(from) > 400 * 86400000) return "Zeitraum zu lang";
  const nightsMin = int(b.nightsMin, 1, 120), nightsMax = int(b.nightsMax, 1, 120);
  const childAges = Array.isArray(b.childAges) ? b.childAges.map(x => int(x, 0, 17)).filter((x): x is number => x !== undefined).slice(0, 20) : [];
  return {
    area: oneOf(b.area, CRUISE_AREAS) || "any", from, to, adults: int(b.adults, 1, 40) || 2, lang: oneOf(b.lang, LANGS) || "de",
    ...(str(b.port, 60) ? { port: str(b.port, 60) } : {}),
    ...(nightsMin ? { nightsMin } : {}), ...(nightsMax && nightsMax >= (nightsMin || 1) ? { nightsMax } : {}),
    ...(childAges.length ? { childAges } : {}),
    ...(oneOf(b.cabin, CABIN_TYPES) ? { cabin: oneOf(b.cabin, CABIN_TYPES) } : {})
  };
}

/** Schlüssel für den Zwischenspeicher: gleiche Suche, gleiche Treffer (Personen ändern den Preis pro Person kaum) */
export const cruiseKey = (q: CruiseQuery) =>
  [q.area, (q.port || "").toLowerCase(), q.from, q.to, q.nightsMin || "", q.nightsMax || "", q.cabin || "", q.childAges?.length ? "k" : "", q.lang].join("|");

const SYSTEM = `You find real cruise sailings for a group travel cost planner. Search the web (cruise portals and cruise line websites), then answer with JSON only, no other text:
{"cruises":[{"line":"","ship":"","title":"","from":"YYYY-MM-DD","to":"YYYY-MM-DD","nights":0,"ports":[{"place":"","date":"YYYY-MM-DD"},{"sea":true}],"price":{"perPerson":0,"currency":"EUR","cabin":"inside"},"url":"","source":""}]}
- Up to ${CRUISE_HITS} different sailings that match the request and depart within the date window; prefer different cruise lines and ships, cheapest first.
- Only sailings you found in your search results. Never invent sailings, dates, prices or links. url: the page where you found this sailing (must be from your search results); source: that site's name.
- from = embarkation day, to = disembarkation day. ports: the itinerary in order, at least the embarkation and disembarkation port; days at sea as {"sea":true}. Leave out what you do not know.
- price.perPerson: the lowest advertised price per person for the requested cabin (or the cheapest cabin, then name it in cabin: inside, outside, balcony, suite), as a number with ISO currency.
- title: short name in the user's language, e.g. "Mittelmeer ab Barcelona".`;

/** Anfrage an die KI (Gemini-Format; Claude übersetzt google_search in seine Websuche) */
export function cruisePayload(q: CruiseQuery, today = new Date().toISOString().slice(0, 10)) {
  const people = `${q.adults} adults` + (q.childAges?.length ? ` and ${q.childAges.length} children (ages ${q.childAges.join(", ")})` : "");
  const lines = [
    `Today is ${today}. The user's language: ${q.lang}.`,
    `Region: ${AREA_TEXT[q.area]}.`,
    q.port ? `Embarkation port: ${q.port}.` : "",
    `Departure between ${q.from} and ${q.to}.`,
    q.nightsMin || q.nightsMax ? `Length: ${q.nightsMin || 1} to ${q.nightsMax || 30} nights.` : "",
    `Travellers: ${people}.`,
    q.cabin ? `Cabin: ${q.cabin}.` : ""
  ].filter(Boolean);
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: lines.join("\n") }] }],
    tools: [{ google_search: {} }]
  };
}

/** Text der Antwort (Gemini-Format), Teile zusammengefügt */
export const answerText = (res: unknown): string =>
  ((res as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");

/** JSON aus dem Text lesen (auch in ```-Blöcken oder mit Text drumherum) */
function jsonOf(text: string): unknown {
  const s = text.replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

const nightsOf = (a: string, b?: string) => (b && b > a ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : undefined);

/** Treffer prüfen: Link zur Fundstelle, Schiff oder Reederei, Abfahrt im Zeitraum; doppelte (Schiff + Tag) nur einmal */
export function cruisesFromAi(res: unknown, q: CruiseQuery): CruiseHit[] {
  const list = obj(jsonOf(answerText(res))).cruises;
  const out: CruiseHit[] = [];
  for (const c of (Array.isArray(list) ? list : []).map(obj)) {
    const url = typeof c.url === "string" && /^https?:\/\/[^\s]+$/i.test(c.url.trim()) ? c.url.trim().slice(0, 500) : "";
    const line = str(c.line, 60), ship = str(c.ship, 60);
    const ports = parsePorts(c.ports);
    const from = day(c.from) || ports.find(p => p.date)?.date;
    if (!url || !host(url) || (!line && !ship) || !from || from < q.from || from > q.to) continue;
    const to = day(c.to) || [...ports].reverse().find(p => p.date)?.date;
    const p = obj(c.price), pp = typeof p.perPerson === "number" && p.perPerson >= 50 && p.perPerson <= 100_000 ? Math.round(p.perPerson) : undefined;
    const cur = typeof p.currency === "string" && /^[A-Za-z]{3}$/.test(p.currency) ? p.currency.toUpperCase() : "EUR";
    const cabin = oneOf(p.cabin, CABIN_TYPES);
    const nights = int(c.nights, 1, 120) ?? nightsOf(from, to);
    const id = `${(ship || line || "").toLowerCase()}|${from}`;
    if (out.some(h => h.id === id)) continue;
    out.push({
      id, from, ports, url, source: str(c.source, 40) || host(url),
      ...(line ? { line } : {}), ...(ship ? { ship } : {}), ...(str(c.title, 80) ? { title: str(c.title, 80) } : {}),
      ...(to && to >= from ? { to } : {}), ...(nights ? { nights } : {}),
      ...(pp ? { price: { perPerson: pp, currency: cur, ...(cabin ? { cabin } : {}) } } : {})
    });
    if (out.length >= CRUISE_HITS) break;
  }
  // günstigste zuerst, ohne Preis ans Ende (Reihenfolge nur nach Preis, nie nach Partnern)
  return out.sort((a, b) => (a.price?.perPerson ?? Infinity) - (b.price?.perPerson ?? Infinity));
}
