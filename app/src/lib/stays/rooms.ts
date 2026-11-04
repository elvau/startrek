/* Schlafzimmer und Schlafplätze (#674): aus Namen und der Auskunft von Booking.com lesen, danach filtern */
import { callTools } from "../mcp";
import type { StayOffer, StayQuery } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const DE = ["null", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf"];
const N = `(\\d{1,2}|${EN.join("|")}|${DE.join("|")})`;
const BED = new RegExp(`(?<![\\p{L}\\d])${N}[\\s-]*(?:bed[\\s-]?rooms?|schlafzimmern?|schlafräumen?|sz(?![\\p{L}])|dormitorios?|chambres?|camere|sypialni[ae]?)`, "giu");
const SLEEP = new RegExp(`(?<![\\p{L}\\d])${N}\\s*(?:guests?|people|persons?|personen|pers\\.?(?![\\p{L}])|gäste?n?|huéspedes|personnes|osób|osoby)`, "giu");

const value = (s: string): number => {
  const w = s.toLowerCase();
  return /^\d+$/.test(w) ? +w : EN.includes(w) ? EN.indexOf(w) : DE.indexOf(w);
};
const most = (re: RegExp, t: string): number | undefined => {
  const all = [...t.matchAll(re)].map(m => value(m[1])).filter(n => n >= 0 && n <= 60);
  return all.length ? Math.max(...all) : undefined;
};

/**
 * Schlafzimmer und Schlafplätze aus einem Text („Ferienhaus mit 4 Schlafzimmern für 10 Personen“, Auskunft „five bedrooms …
 * ten guests“). Mehrere Einheiten (Aparthotel mit 1-, 2- und 3-Zimmer-Wohnungen): die größte. „Studio“ ohne Angabe = 0.
 */
export function roomsOf(text: string): Pick<StayOffer, "bedrooms" | "sleeps"> {
  const t = text || "";
  const bedrooms = most(BED, t) ?? (/(?<![\p{L}])studio(?![\p{L}])/iu.test(t) ? 0 : undefined);
  const sleeps = most(SLEEP, t);
  return { ...(bedrooms != null ? { bedrooms } : {}), ...(sleeps != null ? { sleeps } : {}) };
}

/** Angaben aus dem Namen übernehmen, wo der Anbieter nichts nennt */
export function withRooms(o: StayOffer): StayOffer {
  if (o.bedrooms != null && o.sleeps != null) return o;
  const r = roomsOf(o.name);
  return { ...o, ...(o.bedrooms == null && r.bedrooms != null ? { bedrooms: r.bedrooms } : {}), ...(o.sleeps == null && r.sleeps != null ? { sleeps: r.sleeps } : {}) };
}

/** Schlafzimmer- bzw. Schlafplatz-Wunsch erfüllt; ohne Angabe nicht (Angebot fällt weg, wie beim Verpflegungs-Filter) */
export const roomsFit = (o: Pick<StayOffer, "bedrooms" | "sleeps">, q: Pick<StayQuery, "bedroomsMin" | "sleepsMin">): boolean =>
  (!q.bedroomsMin || (o.bedrooms ?? -1) >= q.bedroomsMin) && (!q.sleepsMin || (o.sleeps ?? -1) >= q.sleepsMin);

/** Art laut Booking.com, die sicher keine ganze Einheit ist (dafür keine Rückfrage) */
const HOTELISH = /hotel|pension|gasthof|gasthaus|hostel|resort|motel|bed (?:and|&) breakfast|b&b|inn\b|guest ?house|gästehaus|herberge|kapselhotel|zimmer/i;

/** Rückfrage je Unterkunft kostet Anfragen (Cloudflare: 50 je Aufruf); nur die günstigsten Kandidaten */
export const ASK_MAX = 5;
const QUESTION = "How many bedrooms does this property have, and how many guests can it sleep in total? If there are several units or apartment types, list each with its bedrooms and guests.";

/**
 * Booking.com nennt Schlafzimmer nicht in der Suche, beantwortet aber Fragen je Unterkunft (answer_property_qa_by_ids_v2).
 * Für die günstigsten ganzen Unterkünfte ohne Angabe nachfragen; bei Fehlern bleibt es bei „unbekannt“.
 */
export async function askRooms(offers: StayOffer[], data: any, url: string, f: typeof fetch = fetch, max = ASK_MAX): Promise<StayOffer[]> {
  const kind = new Map<string, string>((data?.accommodations || []).map((a: any) => ["booking:" + a.id, String(a.accommodationType || "")]));
  const list = offers.map(withRooms);
  const ask = list.filter(o => o.bedrooms == null && !HOTELISH.test(kind.get(o.id) || "")).sort((a, b) => a.total - b.total).slice(0, max);
  if (!ask.length) return list;
  const answers = await callTools(url, ask.map(o => ({ tool: "answer_property_qa_by_ids_v2", args: { hotel_ids: [+o.id.slice("booking:".length)], user_question: QUESTION } })), "Booking.com", f).catch(() => []);
  const got = new Map(ask.map((o, i) => [o.id, roomsOf(String(answers[i]?.answer || ""))]));
  return list.map(o => {
    const r = got.get(o.id);
    return r ? { ...o, ...(r.bedrooms != null ? { bedrooms: r.bedrooms } : {}), ...(r.sleeps != null && o.sleeps == null ? { sleeps: r.sleeps } : {}) } : o;
  });
}
