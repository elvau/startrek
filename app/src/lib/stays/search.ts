/* Unterkünfte: alle Quellen gleichzeitig fragen, Doppelte zusammenführen, nach Preis sortieren */
import type { SourceStatus } from "../flights/types";
import { searchBooking, searchTrivago, TRIVAGO_MCP } from "./providers";
import { searchLite } from "./liteapi";
import { inCurrency, type Rates } from "../fx";
import { keepStays } from "./sort";
import { STAY_MUSTS, type StayMust, type StayOffer, type StayQuery, type StaySearchResult } from "./types";

/** Adressen der MCP-Server (Cloudflare-Variablen); Booking.com erst mit eingetragener Adresse */
export interface StayEnv {
  BOOKING_MCP_URL?: string; TRIVAGO_MCP_URL?: string;
  /** liteAPI: Schlüssel (Secret) und optional die eigene Buchungsseite (White Label) für die Links */
  LITEAPI_KEY?: string; LITEAPI_LINK?: string;
  /** Tageskurse (EZB), vom Such-Dienst gesetzt */
  FX?: Rates | null;
}

interface Provider {
  id: string;
  name: string;
  configured: (env: StayEnv) => boolean;
  /** Testzugang (Sandbox-Schlüssel): Treffer werden als Test markiert */
  test?: (env: StayEnv) => boolean;
  search: (q: StayQuery, env: StayEnv, f: typeof fetch) => Promise<StayOffer[]>;
}

export const STAY_PROVIDERS: Provider[] = [
  { id: "booking", name: "Booking.com", configured: env => !!env.BOOKING_MCP_URL, search: (q, env, f) => searchBooking(q, env.BOOKING_MCP_URL!, f) },
  { id: "trivago", name: "Trivago", configured: () => true, search: (q, env, f) => searchTrivago(q, env.TRIVAGO_MCP_URL || TRIVAGO_MCP, f) },
  { id: "liteapi", name: "liteAPI", configured: env => !!env.LITEAPI_KEY, test: env => !!env.LITEAPI_KEY?.startsWith("sand_"), search: (q, env, f) => searchLite(q, env.LITEAPI_KEY!, f, env.LITEAPI_LINK || undefined) }
];

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`keine Antwort nach ${ms / 1000} s`)), ms))]);

/** gleiche Unterkunft aus mehreren Quellen (gleicher Name, höchstens ~300 m auseinander): nur die günstigste bleibt */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const near = (a: StayOffer, b: StayOffer) =>
  a.lat == null || b.lat == null || a.lon == null || b.lon == null || (Math.abs(a.lat - b.lat) < 0.003 && Math.abs(a.lon - b.lon) < 0.004);

export function mergeStays(lists: StayOffer[][]): StayOffer[] {
  const out: StayOffer[] = [];
  for (const o of lists.flat()) {
    const i = out.findIndex(x => norm(x.name) === norm(o.name) && near(x, o));
    if (i < 0) out.push(o);
    // echter Preis geht vor einem Testpreis (Sandbox)
    else if (!!out[i].test === !!o.test ? o.total < out[i].total : out[i].test) out[i] = o;
  }
  return out.sort((a, b) => a.total - b.total);
}

/** angebundene Quellen der Unterkunftssuche (für /health, ohne Schlüssel) */
export const configuredStays = (env: StayEnv): string[] => STAY_PROVIDERS.filter(p => p.configured(env)).map(p => p.id);

export async function searchStays(q: StayQuery, env: StayEnv = {}, f: typeof fetch = fetch, timeoutMs = 25000): Promise<StaySearchResult> {
  const wanted = (p: Provider) => !q.sources?.length || q.sources.includes(p.id);
  const active = STAY_PROVIDERS.filter(p => wanted(p) && p.configured(env));
  const sources: SourceStatus[] = STAY_PROVIDERS.filter(p => wanted(p) && !p.configured(env)).map(p => ({ id: p.id, name: p.name, configured: false, ok: false, count: 0 }));
  const lists = await Promise.all(active.map(async p => {
    const t0 = Date.now();
    try {
      const test = !!p.test?.(env);
      const offers = inCurrency(await withTimeout(p.search(q, env, f), timeoutMs), "total", q.currency || "EUR", env.FX).map(o => (test ? { ...o, test } : o));
      sources.push({ id: p.id, name: p.name, configured: true, ok: true, count: offers.length, ms: Date.now() - t0, ...(test ? { test } : {}) });
      return offers;
    } catch (e) {
      sources.push({ id: p.id, name: p.name, configured: true, ok: false, count: 0, ms: Date.now() - t0, error: (e as Error).message });
      return [];
    }
  }));
  sources.sort((a, b) => STAY_PROVIDERS.findIndex(p => p.id === a.id) - STAY_PROVIDERS.findIndex(p => p.id === b.id));
  return { offers: keepStays(mergeStays(lists), q), sources };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const DAY = 86400000;

/** Anfrage prüfen (im Such-Dienst, bevor irgendwer gefragt wird) */
export function parseStayQuery(b: unknown): StayQuery | string {
  const o = (b || {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const place = str("place"), country = str("country"), checkin = str("checkin"), checkout = str("checkout");
  const cc = str("cc").toUpperCase();
  if (cc && !/^[A-Z]{2}$/.test(cc)) return "Land als ISO-Code (z. B. ES)";
  const geo = typeof o.lat === "number" && typeof o.lon === "number" && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180 ? { lat: o.lat, lon: o.lon } : {};
  if (!place || place.length > 80 || country.length > 60) return "Ort angeben";
  if (!DATE.test(checkin) || !DATE.test(checkout)) return "Datum im Format JJJJ-MM-TT";
  const n = (Date.parse(checkout) - Date.parse(checkin)) / DAY;
  if (!(n >= 1)) return "Abreise muss nach der Anreise liegen";
  if (n > 90) return "Höchstens 90 Nächte";
  const adults = o.adults ?? 1, rooms = o.rooms ?? 1, childAges = o.childAges ?? [];
  if (!int(adults, 1, 20)) return "1 bis 20 Erwachsene";
  if (!Array.isArray(childAges) || childAges.length > 10 || !childAges.every(a => int(a, 0, 17))) return "Kinder: bis zu 10, Alter 0 bis 17";
  if (!int(rooms, 1, 10) || (rooms as number) > (adults as number)) return "Zimmer: 1 bis 10, höchstens so viele wie Erwachsene";
  const type = o.type ?? "all";
  if (type !== "whole" && type !== "hotel" && type !== "all") return "Art: whole, hotel oder all";
  let sources: string[] | undefined;
  if (o.sources != null) {
    if (!Array.isArray(o.sources) || !o.sources.every(s => STAY_PROVIDERS.some(p => p.id === s))) return "Unbekannte Quelle";
    sources = o.sources as string[];
  }
  const currency = str("currency") || "EUR";
  if (!/^[A-Z]{3}$/.test(currency)) return "Währung ungültig";
  let must: StayMust[] | undefined;
  if (o.must != null) {
    if (!Array.isArray(o.must) || !o.must.every(m => (STAY_MUSTS as readonly unknown[]).includes(m))) return "Unbekannte Ausstattung";
    if (o.must.length) must = [...new Set(o.must as StayMust[])];
  }
  if (o.minStars != null && !int(o.minStars, 1, 5)) return "Sterne: 1 bis 5";
  if (o.minScore != null && !(typeof o.minScore === "number" && o.minScore >= 0 && o.minScore <= 10)) return "Bewertung: 0 bis 10";
  return {
    place, ...(country ? { country } : {}), ...(cc ? { cc } : {}), ...geo, checkin, checkout, adults: adults as number, childAges: childAges as number[], rooms: rooms as number, type,
    ...(sources ? { sources } : {}), currency, ...(must ? { must } : {}),
    ...(o.minStars != null ? { minStars: o.minStars as number } : {}), ...(o.minScore ? { minScore: o.minScore as number } : {})
  };
}
