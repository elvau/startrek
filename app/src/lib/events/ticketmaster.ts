/* Ticketmaster Discovery API: Konzerte, Sport, Shows weltweit (kostenloser Schlüssel) */
import type { EventHit, EventQuery } from "./types";

export const TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

export function tmParams(q: EventQuery, key: string, today: string): URLSearchParams {
  const from = q.from || today;
  const p = new URLSearchParams({ apikey: key, keyword: q.q, size: "30", sort: "date,asc", locale: "*", startDateTime: `${from}T00:00:00Z` });
  if (q.to) p.set("endDateTime", `${q.to}T23:59:59Z`);
  return p;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function fromTicketmaster(data: any): EventHit[] {
  const list: any[] = data?._embedded?.events || [];
  return list.map(e => {
    const v = e._embedded?.venues?.[0] || {};
    const d = e.dates?.start || {};
    const lat = Number(v.location?.latitude), lon = Number(v.location?.longitude);
    const cls = e.classifications?.[0];
    return {
      id: `tm:${e.id}`, source: "ticketmaster", sourceName: "Ticketmaster", name: String(e.name || ""),
      start: d.localDate ? (d.localTime ? `${d.localDate}T${String(d.localTime).slice(0, 5)}` : d.localDate) : "",
      ...(v.name ? { venue: v.name } : {}), ...(v.city?.name ? { city: v.city.name } : {}),
      ...(v.country?.countryCode ? { cc: v.country.countryCode } : {}),
      ...(isFinite(lat) && isFinite(lon) && (lat || lon) ? { lat, lon } : {}),
      ...(e.url ? { url: e.url } : {}),
      ...(cls?.genre?.name || cls?.segment?.name ? { category: cls.genre?.name && cls.genre.name !== "Undefined" ? cls.genre.name : cls.segment?.name } : {})
    };
  }).filter(e => e.name && e.start);
}

export async function searchTicketmaster(q: EventQuery, key: string, f: typeof fetch = fetch, today = new Date().toISOString().slice(0, 10)): Promise<EventHit[]> {
  const res = await f(`${TM_URL}?${tmParams(q, key, today)}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
  return fromTicketmaster(await res.json());
}
