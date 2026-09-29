/* Event-Suche: alle Quellen gleichzeitig fragen, zusammenführen, nach Datum sortieren */
import type { SourceStatus } from "../flights/types";
import { searchFootballData, type Cached } from "./footballdata";
import { searchTicketmaster } from "./ticketmaster";
import type { EventEnv, EventHit, EventQuery, EventSearchResult } from "./types";

interface Provider {
  id: string;
  name: string;
  configured: (env: EventEnv) => boolean;
  search: (q: EventQuery, env: EventEnv, f: typeof fetch, cached?: Cached) => Promise<EventHit[]>;
}

export const EVENT_PROVIDERS: Provider[] = [
  { id: "ticketmaster", name: "Ticketmaster", configured: env => !!env.TICKETMASTER_KEY, search: (q, env, f) => searchTicketmaster(q, env.TICKETMASTER_KEY!, f) },
  { id: "footballdata", name: "football-data.org", configured: env => !!env.FOOTBALL_DATA_KEY, search: (q, env, f, c) => searchFootballData(q, env.FOOTBALL_DATA_KEY!, f, c) }
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
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 40);
}

export async function searchEvents(q: EventQuery, env: EventEnv = {}, f: typeof fetch = fetch, cached?: Cached, timeoutMs = 20000): Promise<EventSearchResult> {
  const active = EVENT_PROVIDERS.filter(p => p.configured(env));
  const sources: SourceStatus[] = EVENT_PROVIDERS.filter(p => !p.configured(env)).map(p => ({ id: p.id, name: p.name, configured: false, ok: false, count: 0 }));
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
  return { events: mergeEvents(lists), sources };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Anfrage prüfen (im Such-Dienst) */
export function parseEventQuery(b: unknown): EventQuery | string {
  const o = (b || {}) as Record<string, unknown>;
  const q = typeof o.q === "string" ? o.q.trim() : "";
  if (q.length < 2 || q.length > 80) return "Suchbegriff angeben (2 bis 80 Zeichen)";
  const from = typeof o.from === "string" && o.from ? o.from : undefined, to = typeof o.to === "string" && o.to ? o.to : undefined;
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return "Datum im Format JJJJ-MM-TT";
  if (from && to && to < from) return "Zeitraum endet vor dem Anfang";
  return { q, ...(from ? { from } : {}), ...(to ? { to } : {}) };
}
