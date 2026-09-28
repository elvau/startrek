/* Kiwi.com über den öffentlichen MCP-Server (ohne Schlüssel) */
import type { FlightOffer, FlightQuery, OfferLeg } from "./types";

export const KIWI_MCP = "https://mcp.kiwi.com";

/** JJJJ-MM-TT → TT/MM/JJJJ */
const kiwiDate = (iso: string) => iso.split("-").reverse().join("/");

export function kiwiArgs(q: FlightQuery) {
  return {
    flyFrom: q.from, flyTo: q.to, departureDate: kiwiDate(q.depart),
    ...(q.ret ? { returnDate: kiwiDate(q.ret) } : {}),
    adults: Math.max(1, q.adults), children: q.children, infants: q.infants,
    currency: q.currency || "EUR", locale: "de", sort: "price"
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function leg(l: any): OfferLeg {
  const segs: any[] = l.segments || [];
  return {
    from: l.from ?? segs[0]?.from, to: l.to ?? segs.at(-1)?.to,
    fromCity: segs[0]?.fromCity, toCity: segs.at(-1)?.toCity,
    dep: l.departureTime, arr: l.arrivalTime,
    minutes: Math.round((l.durationSeconds || 0) / 60), stops: l.stops ?? Math.max(0, segs.length - 1),
    route: l.route || [], carriers: [...new Set(segs.map(s => s.carrierName || s.carrier).filter(Boolean))] as string[],
    flights: segs.map(s => s.flightNumber).filter(Boolean)
  };
}

/** Antwort von search-flight in unser Format */
export function fromKiwi(data: any): FlightOffer[] {
  return (data?.itineraries || []).filter((i: any) => i?.outbound && typeof i.price === "number").map((i: any): FlightOffer => ({
    id: "kiwi:" + i.id, source: "kiwi", sourceName: "Kiwi.com",
    price: i.price, currency: data.currency || "EUR", url: i.bookingUrl,
    out: leg(i.outbound), back: i.inbound ? leg(i.inbound) : undefined,
    baggage: i.baggage ? { personal: i.baggage.personalItem || 0, cabin: i.baggage.cabinBag || 0, checked: i.baggage.checkedBag || 0 } : undefined
  }));
}

/** JSON-RPC-Antwort lesen: als JSON oder als Server-Sent Events (Streamable HTTP) */
async function rpc(res: Response): Promise<any> {
  if (!res.ok) throw new Error(`Kiwi antwortet mit ${res.status}`);
  const text = await res.text();
  if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
    const msgs = text.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean);
    return msgs.find(m => "result" in m || "error" in m) ?? msgs.at(-1);
  }
  return text ? JSON.parse(text) : null;
}

/** Suche über MCP: initialize → initialized → tools/call search-flight */
export async function searchKiwi(q: FlightQuery, fetchFn: typeof fetch = fetch, url = KIWI_MCP): Promise<FlightOffer[]> {
  const base = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  const init = await fetchFn(url, { method: "POST", headers: base, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "reisekasse", version: "1.0" } }
  }) });
  const session = init.headers.get("mcp-session-id");
  const hello = await rpc(init);
  if (hello?.error) throw new Error(hello.error.message || "Kiwi: Verbindung abgelehnt");
  const headers: Record<string, string> = { ...base, ...(session ? { "mcp-session-id": session } : {}) };
  await fetchFn(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  const res = await rpc(await fetchFn(url, { method: "POST", headers, body: JSON.stringify({
    jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search-flight", arguments: kiwiArgs(q) }
  }) }));
  if (res?.error) throw new Error(res.error.message || "Kiwi: Fehler bei der Suche");
  const r = res?.result;
  if (r?.isError) throw new Error(r.content?.[0]?.text || "Kiwi: Fehler bei der Suche");
  const data = r?.structuredContent ?? JSON.parse(r?.content?.find((c: any) => c.type === "text")?.text || "{}");
  if (data?.error) throw new Error(String(data.error));
  return fromKiwi(data);
}
