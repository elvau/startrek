/* Event-Suche: alle Quellen gleichzeitig fragen, zusammenführen, nach Datum sortieren */
import type { SourceStatus } from "../flights/types";
import { searchFootballData, type Cached } from "./footballdata";
import { searchTicketmaster } from "./ticketmaster";
import { searchSports, SPORT_FILTERS } from "./sports";
import type { EventEnv, EventHit, EventQuery, EventSearchResult } from "./types";

interface Provider {
  id: string;
  name: string;
  configured: (env: EventEnv) => boolean;
  search: (q: EventQuery, env: EventEnv, f: typeof fetch, cached?: Cached) => Promise<EventHit[]>;
}

export const EVENT_PROVIDERS: Provider[] = [
  { id: "ticketmaster", name: "Ticketmaster", configured: env => !!env.TICKETMASTER_KEY, search: (q, env, f) => searchTicketmaster(q, env.TICKETMASTER_KEY!, f) },
  { id: "footballdata", name: "football-data.org", configured: env => !!env.FOOTBALL_DATA_KEY, search: (q, env, f, c) => searchFootballData(q, env.FOOTBALL_DATA_KEY!, f, c) },
  // eigener Sportkalender, ohne Schlüssel
  { id: "sports", name: "Sportkalender", configured: () => true, search: async q => searchSports(q) }
];

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`keine Antwort nach ${ms / 1000} s`)), ms))]);

/** gleiches Ereignis aus zwei Quellen (gleicher Tag, gleiches erstes Wort, z. B. „Arsenal – Bayern“ und „Arsenal v Bayern“) */
const key = (e: EventHit) => `${e.start.slice(0, 10)}|${e.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).find(w => w.length >= 3) || e.name}`;

export function mergeEvents(lists: EventHit[][]): EventHit[] {
  const out = new Map<string, EventHit>();
  for (const e of lists.flat()) {
    const k = key(e), cur = out.get(k);
    // erster Treffer bleibt, fehlende Angaben kommen vom zweiten
    out.set(k, cur ? { ...e, ...cur, city: cur.city ?? e.city, venue: cur.venue ?? e.venue, lat: cur.lat ?? e.lat, lon: cur.lon ?? e.lon, url: cur.url ?? e.url } : e);
  }
  return uniqueById([...out.values()]).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 40);
}

/** jede ID nur einmal (Ticketmaster liefert dasselbe Event manchmal doppelt; die Liste in der App braucht eindeutige IDs) */
export function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter(e => !seen.has(e.id) && !!seen.add(e.id));
}

export async function searchEvents(q: EventQuery, env: EventEnv = {}, f: typeof fetch = fetch, cached?: Cached, timeoutMs = 20000): Promise<EventSearchResult> {
  // nach Sportart fragt nur der Sportkalender
  const active = EVENT_PROVIDERS.filter(p => p.configured(env) && (!q.sport || p.id === "sports"));
  const sources: SourceStatus[] = EVENT_PROVIDERS.filter(p => !p.configured(env) && !q.sport).map(p => ({ id: p.id, name: p.name, configured: false, ok: false, count: 0 }));
  const lists = await Promise.all(active.map(async p => {
    const t0 = Date.now();
    try {
      const list = await withTimeout(p.search(q, env, f, cached), timeoutMs);
      sources.push({ id: p.id, name: p.name, configured: true, ok: true, count: list.length, ms: Date.now() - t0 });
      return list;
    } catch (e) {
      sources.push({ id: p.id, name: p.name, configured: true, ok: false, count: 0, ms: Date.now() - t0, error: (e as Error).message });
      return [];
    }
  }));
  sources.sort((a, b) => EVENT_PROVIDERS.findIndex(p => p.id === a.id) - EVENT_PROVIDERS.findIndex(p => p.id === b.id));
  const events = mergeEvents(lists);
  return { events: q.city ? events.filter(e => inCity(e, q)) : events, sources };
}

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const RADIUS_KM = 40;
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
/** Treffer am Reiseort: im Umkreis, sonst Stadt gleich oder in der Anschrift (football-data hat nur die Anschrift) */
export function inCity(e: EventHit, q: EventQuery): boolean {
  if (e.lat != null && e.lon != null && q.lat != null && q.lon != null) return km(e as { lat: number; lon: number }, q as { lat: number; lon: number }) <= RADIUS_KM;
  const names = [q.city, q.cityEn].filter((x): x is string => !!x).map(plain);
  if (e.city) return names.includes(plain(e.city));
  if (e.address) return names.some(n => plain(e.address!).includes(n));
  return true;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Anfrage prüfen (im Such-Dienst) */
export function parseEventQuery(b: unknown): EventQuery | string {
  const o = (b || {}) as Record<string, unknown>;
  const q = typeof o.q === "string" ? o.q.trim() : "";
  const city = typeof o.city === "string" ? o.city.trim() : "";
  const cc = typeof o.cc === "string" && /^[A-Z]{2}$/.test(o.cc) ? o.cc : undefined;
  const cityEn = typeof o.cityEn === "string" && o.cityEn.trim().length <= 60 ? o.cityEn.trim() : "";
  const lat = Number(o.lat), lon = Number(o.lon);
  const at = o.lat != null && o.lon != null && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {};
  if (city.length > 60) return "Stadt zu lang";
  const sport = typeof o.sport === "string" && SPORT_FILTERS.includes(o.sport) ? o.sport : undefined;
  const lang = typeof o.lang === "string" && /^[a-z]{2}$/.test(o.lang) ? o.lang : undefined;
  // mit Stadt oder Sportart darf der Suchbegriff fehlen („Was läuft vor Ort“, „Wintersport“)
  if ((q || (!city && !sport)) && (q.length < 2 || q.length > 80)) return "Suchbegriff angeben (2 bis 80 Zeichen)";
  if (city && city.length < 2) return "Stadt angeben";
  const from = typeof o.from === "string" && o.from ? o.from : undefined, to = typeof o.to === "string" && o.to ? o.to : undefined;
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return "Datum im Format JJJJ-MM-TT";
  if (from && to && to < from) return "Zeitraum endet vor dem Anfang";
  return { q, ...(sport ? { sport } : {}), ...(lang ? { lang } : {}), ...(city ? { city, ...(cityEn ? { cityEn } : {}), ...(cc ? { cc } : {}), ...at } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
}
