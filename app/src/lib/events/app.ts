/* Event-Suche in der App: Anfrage an den Such-Dienst, Stadt aus der Anschrift ableiten */
import { t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { searchLocs, type AirportData } from "../geo/locations";
import { findCity, type GeoData } from "../geo/places";
import type { EventQuery, EventSearchResult } from "./types";

export async function searchEventsRemote(q: EventQuery, signal?: AbortSignal): Promise<EventSearchResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const res = await fetch(`${FLIGHTS_URL}/events/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("search.status", { s: res.status }));
  return data as EventSearchResult;
}

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
