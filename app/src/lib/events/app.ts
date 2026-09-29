/* Event-Suche in der App: Anfrage an den Such-Dienst, Stadt aus der Anschrift ableiten */
import { t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { searchLocs, type AirportData } from "../geo/locations";
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
 * gegen die Städteliste, gleiches Land bevorzugt. Ohne Treffer: null (dann trägt man die Stadt selbst ein).
 */
export function cityFromAddress(d: AirportData, address: string, cc?: string): string | null {
  const ws = address.split(/[\s,]+/).filter(w => /^\p{L}[\p{L}'-]{2,}$/u.test(w));
  const tries: string[] = [];
  for (let i = ws.length - 1; i >= 0; i--) { if (i > 0) tries.push(`${ws[i - 1]} ${ws[i]}`); tries.push(ws[i]); }
  for (const w of tries) {
    const hit = searchLocs(d, w, 3).find(l => l.kind === "city" && (!cc || l.cc === cc) && [l.city, l.en].some(n => n?.toLowerCase() === w.toLowerCase()));
    if (hit) return hit.city;
  }
  return null;
}
