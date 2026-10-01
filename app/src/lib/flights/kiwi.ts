/* Kiwi.com über den öffentlichen MCP-Server (ohne Schlüssel) */
import type { FlightOffer, FlightQuery, OfferLeg } from "./types";
import { callTool } from "../mcp";

export const KIWI_MCP = "https://mcp.kiwi.com";

/** JJJJ-MM-TT → TT/MM/JJJJ */
const kiwiDate = (iso: string) => iso.split("-").reverse().join("/");

/** Tage auf ein Datum (JJJJ-MM-TT) rechnen */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** mehrere Flughäfen: Kiwi nimmt eine Liste („SPU,BWK,DBV“) und sucht alle auf einmal */
const kiwiPlace = (code: string, aps?: string[]) => (aps && aps.length > 1 ? aps.join(",") : code);

/**
 * Koffer insgesamt auf die Reisenden verteilen: erst je einer für Erwachsene, dann für Kinder, dann ein zweiter
 * (höchstens zwei je Person). Kiwi bucht Koffer je Person, so reichen z. B. 3 Koffer für 2 Erwachsene und 3 Kinder.
 */
export function holdBags(adults: number, children: number, total: number): { adults: number[]; children: number[] } {
  const a = Array(adults).fill(0) as number[], c = Array(children).fill(0) as number[];
  let left = Math.max(0, Math.min(total, 2 * (adults + children)));
  for (let round = 0; round < 2 && left; round++) {
    for (let i = 0; i < adults && left; i++, left--) a[i]++;
    for (let i = 0; i < children && left; i++, left--) c[i]++;
  }
  return { adults: a, children: c };
}

export function kiwiArgs(q: FlightQuery) {
  // flexibel: Abflug zwischen frühester Abreise und (späteste Rückkehr − Mindest-Nächte), Nächte als Spanne
  const flex = q.latest && q.nightsMin
    ? { departureDateTo: kiwiDate(addDays(q.latest, -q.nightsMin)), nights_in_dst_from: q.nightsMin, nights_in_dst_to: q.nightsMax ?? q.nightsMin }
    : null;
  const window = !flex && q.departTo && !q.ret ? { departureDateTo: kiwiDate(q.departTo) } : null;
  const fixedFlex = !flex && !window && q.flexDays ? { departureDateFlexDays: q.flexDays, ...(q.ret ? { returnDateFlexDays: q.flexDays } : {}) } : {};
  const adults = Math.max(1, q.adults);
  return {
    flyFrom: kiwiPlace(q.from, q.fromAirports), flyTo: kiwiPlace(q.to, q.toAirports), departureDate: kiwiDate(q.depart),
    ...(flex ?? window ?? (q.ret ? { returnDate: kiwiDate(q.ret) } : {})), ...fixedFlex,
    // Gabelflug: mindestens ein Umstieg, und zwar dort
    ...(q.maxStops != null ? { max_sector_stopovers: q.via?.length ? Math.max(1, q.maxStops) : q.maxStops } : {}),
    ...(q.via?.length ? { stopover_airports: q.via.join(","), stopover_from: q.viaHours?.[0] ?? 8, stopover_to: q.viaHours?.[1] ?? 48 } : {}),
    ...(q.selfTransfer != null ? { allow_self_transfer: q.selfTransfer } : {}),
    ...(q.avoidCountries?.length ? { exclude_stopover_countries: q.avoidCountries.join(",") } : {}),
    ...(q.maxHours ? { max_fly_duration: q.maxHours } : {}),
    ...(q.bagCount != null
      ? (({ adults: a, children: c }) => (q.bagCount ? { adults_hold_bags: a, ...(q.children ? { children_hold_bags: c } : {}) } : {}))(holdBags(adults, q.children || 0, q.bagCount))
      : q.bags ? { adults_hold_bags: Array(adults).fill(1), ...(q.children ? { children_hold_bags: Array(q.children).fill(1) } : {}) } : {}),
    adults, children: q.children, infants: q.infants,
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
    flights: segs.map(s => s.flightNumber).filter(Boolean),
    layovers: segs.slice(1).map((s, i) => ({ at: s.from, hours: Math.round((Date.parse(s.departureTime) - Date.parse(segs[i].arrivalTime)) / 360000) / 10 })).filter(x => !isNaN(x.hours))
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

/** Suche über den MCP-Server von Kiwi (Werkzeug search-flight) */
export async function searchKiwi(q: FlightQuery, fetchFn: typeof fetch = fetch, url = KIWI_MCP): Promise<FlightOffer[]> {
  const data = await callTool(url, "search-flight", kiwiArgs(q), "Kiwi", fetchFn);
  if (data?.error) throw new Error(String(data.error));
  return fromKiwi(data);
}
