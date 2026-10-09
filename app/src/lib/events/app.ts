/* Event-Suche in der App: Anfrage an den Such-Dienst, Stadt aus der Anschrift ableiten */
import { i18n, t, type Key } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { dayShort, range } from "../format";
import { inCity, mergeEvents } from "./search";
import { searchSports, SPORTS, type SportEvent } from "./sports";
import { mergeFeed, type SportFeed } from "./feed";
import { searchLocs, type AirportData } from "../geo/locations";
import { findCity, type GeoData } from "../geo/places";
import type { EventHit, EventQuery, EventSearchResult } from "./types";
import { errorText } from "../netcheck";

async function remote(q: EventQuery, signal?: AbortSignal): Promise<EventSearchResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const res = await fetch(`${FLIGHTS_URL}/events/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 429 ? t("search.tooMany") : data.error || t("search.status", { s: res.status }));
  return data as EventSearchResult;
}

/**
 * Event-Suche mit dem Sportkalender: der kommt auch ohne (oder mit älterem) Such-Dienst aus der App, doppelte Treffer
 * fallen weg. Nach Sportart fragt nur der Sportkalender; fällt der Such-Dienst aus, bleiben dessen Treffer.
 */
export async function searchEventsRemote(q0: EventQuery, signal?: AbortSignal): Promise<EventSearchResult> {
  const q = { ...q0, lang: i18n.lang };
  const local = searchSports(q, undefined, await sportList()).filter(e => !q.city || inCity(e, q));
  const mine = { id: "sports", name: "Sportkalender", configured: true, ok: true, count: local.length };
  if (q.sport) return { events: local, sources: [mine] };
  try {
    const r = await remote(q, signal);
    return { events: mergeEvents([r.events || [], local]), sources: [...(r.sources || []).filter(s => s.id !== "sports"), mine] };
  } catch (err) {
    if (!local.length || (err as Error).name === "AbortError") throw err;
    return { events: local, sources: [mine, { id: "remote", name: "Such-Dienst", configured: true, ok: false, count: 0, error: errorText(err) }] };
  }
}

const base = () => (import.meta.env?.BASE_URL as string | undefined) || "/";
let feed: Promise<SportEvent[]> | undefined;
/** kuratierte Liste plus public/sports.json (Formel 1, Wikidata); fehlt die Datei oder dauert sie, nur die Liste */
export function sportList(fetchFn: typeof fetch = fetch): Promise<SportEvent[]> {
  feed ??= fetchFn(base() + "sports.json").then(r => (r.ok ? r.json() : null)).then((d: SportFeed | null) => mergeFeed(SPORTS, d?.events || [])).catch(() => SPORTS);
  return Promise.race([feed, new Promise<SportEvent[]>(ok => setTimeout(() => ok(SPORTS), 4000))]);
}

export const SPORT_ICON: Record<string, string> = { multi: "🏅", join: "🏁", run: "🏃", tri: "🏊", bike: "🚴", ski: "⛷", tennis: "🎾", motor: "🏎", golf: "⛳", team: "🏆",
  hand: "🤾", hockey: "🏒", rugby: "🏉", basket: "🏀", nfl: "🏈", athletics: "🏟", darts: "🎯", other: "🎽" };

/** Termin: Tag mit Uhrzeit oder Zeitraum (mehrtägig) */
export const evWhen = (h: EventHit) => (h.end && h.end > h.start.slice(0, 10) ? range(h.start.slice(0, 10), h.end) : `${dayShort(h.start.slice(0, 10))}${h.start.length > 10 ? ` ${h.start.slice(11, 16)}` : ""}`);

/** Sportkalender: Sportart, Anmeldung für alle, vorläufiger Termin (sonst leer) */
export const sportTag = (h: EventHit) => (h.sport
  ? [`${SPORT_ICON[h.sport] || ""} ${t(`sp.${h.sport}` as Key)}`, h.join ? `${SPORT_ICON.join} ${t(`sp.j.${h.join}` as Key)}` : "", h.tbc ? t("sp.tbc") : ""].filter(Boolean).join(" · ")
  : "");

/**
 * Stadt aus einer Anschrift wie „75 Drayton Park London N5 1BU“: Wörter von hinten nach vorn (auch Paare)
 * gegen die Städte der Flughafenliste (auch Städte mit nur einem Flughafen, z. B. Dortmund), danach gegen die
 * Ortsdaten (alle Orte ab 2000 Einwohnern, z. B. Mönchengladbach; dafür müssen die Orte des Landes geladen sein).
 * Gleiches Land bevorzugt. Ohne Treffer: null (dann trägt man die Stadt selbst ein).
 */
export function cityFromAddress(d: AirportData, address: string, cc?: string, g?: GeoData): string | null {
  const ws = address.split(/[\s,]+/).filter(w => /^\p{L}[\p{L}'-]{2,}$/u.test(w));
  const tries: string[] = [];
  for (let i = ws.length - 1; i >= 0; i--) { if (i > 0) tries.push(`${ws[i - 1]} ${ws[i]}`); tries.push(ws[i]); }
  const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();
  for (const w of tries) {
    const hit = searchLocs(d, w, 5).find(l => (!cc || l.cc === cc) && (same(l.city, w) || same(l.en, w)));
    if (hit) return hit.city;
    const place = g && cc ? findCity(g, w, cc) : null;
    if (place) return place.name;
  }
  return null;
}
