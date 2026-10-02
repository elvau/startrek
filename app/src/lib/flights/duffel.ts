/*
 * Duffel (Flug-API mit echten Airline-Tarifen, auch NDC wie Lufthansa und British Airways).
 * Selbst angemeldet, Token als Cloudflare-Secret DUFFEL_TOKEN. Suchen sind bis 1500 je Buchung frei, darüber 0,005 $.
 * Nur feste Daten (Duffel kennt keine Zeitfenster); flexible Suchen übernehmen Kiwi und Travelpayouts.
 * Preise gelten für alle Reisenden, in der Währung der Airline. Duffel nennt keinen Link zum Buchen, gebucht würde
 * später in der App.
 */
import type { FlightOffer, FlightQuery, OfferLeg } from "./types";

export const DUFFEL_URL = "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000";

/** Kinder ohne Alter: Duffel braucht eines, 10 Jahre zählt sicher als Kind */
export function duffelBody(q: FlightQuery) {
  const from = q.fromCityCode || q.fromAirports?.[0] || q.from;
  const to = q.toCityCode || q.toAirports?.[0] || q.to;
  const slices = [{ origin: from, destination: to, departure_date: q.depart }, ...(q.ret ? [{ origin: to, destination: from, departure_date: q.ret }] : [])];
  const passengers = [
    ...Array.from({ length: q.adults }, () => ({ type: "adult" })),
    ...Array.from({ length: q.children }, () => ({ age: 10 })),
    ...Array.from({ length: q.infants }, () => ({ type: "infant_without_seat" }))
  ];
  return { data: { slices, passengers, cabin_class: "economy", ...(q.maxStops != null ? { max_connections: q.maxStops } : {}) } };
}

/** nur feste Daten ohne ± Tage und ohne Umstieg an einem bestimmten Ort */
export const duffelFits = (q: FlightQuery) => !q.latest && !q.departTo && !q.flexDays && !q.via?.length;

/** „PT2H5M“ oder „P1DT3H“ → Minuten */
export function isoMinutes(d: string | undefined): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(d || "");
  return m ? (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function legOf(s: any): OfferLeg {
  const segs: any[] = s.segments || [];
  const first = segs[0] || {}, last = segs[segs.length - 1] || {};
  const route = [first.origin?.iata_code, ...segs.map(x => x.destination?.iata_code)].filter(Boolean) as string[];
  const minutes = isoMinutes(s.duration) || Math.round((Date.parse((last.arriving_at || "").slice(0, 19) + "Z") - Date.parse((first.departing_at || "").slice(0, 19) + "Z")) / 60000) || 0;
  return {
    from: s.origin?.iata_code || first.origin?.iata_code, to: s.destination?.iata_code || last.destination?.iata_code,
    ...(s.origin?.city_name ? { fromCity: s.origin.city_name } : {}), ...(s.destination?.city_name ? { toCity: s.destination.city_name } : {}),
    dep: (first.departing_at || "").slice(0, 19), arr: (last.arriving_at || "").slice(0, 19), minutes, stops: Math.max(0, segs.length - 1), route,
    carriers: [...new Set(segs.map(x => x.marketing_carrier?.name).filter(Boolean))] as string[],
    flights: segs.map(x => `${x.marketing_carrier?.iata_code || ""}${x.marketing_carrier_flight_number || ""}`).filter(Boolean),
    ...(segs.length > 1 ? { layovers: segs.slice(1).map((x, i) => ({ at: x.origin?.iata_code, hours: Math.round((Date.parse(x.departing_at.slice(0, 19) + "Z") - Date.parse(segs[i].arriving_at.slice(0, 19) + "Z")) / 360000) / 10 })) } : {})
  };
}

/** aufgegebene Koffer je Reisendem: was jeder auf der ersten Strecke mindestens hat */
function checkedBags(o: any): number | undefined {
  const pax: any[] = o.slices?.[0]?.segments?.[0]?.passengers || [];
  if (!pax.length) return undefined;
  return Math.min(...pax.map(p => (p.baggages || []).filter((b: any) => b.type === "checked").reduce((v: number, b: any) => v + (b.quantity || 0), 0)));
}

/** Antwort in unser Format, in der Währung der Airline (der Such-Dienst rechnet mit dem Tageskurs um), günstigste zuerst */
export function fromDuffel(data: any): FlightOffer[] {
  return (data?.data?.offers || []).filter((o: any) => /^[A-Z]{3}$/.test(o.total_currency || "") && o.slices?.length).map((o: any): FlightOffer => {
    const [out, back] = o.slices.map(legOf);
    const checked = checkedBags(o);
    return {
      id: "duffel:" + o.id, source: "duffel", sourceName: o.owner?.name ? `Duffel · ${o.owner.name}` : "Duffel",
      price: Math.round(parseFloat(o.total_amount)), currency: o.total_currency, out, ...(back ? { back } : {}),
      ...(checked != null ? { baggage: { personal: 1, cabin: 0, checked } } : {})
    };
  }).filter((o: FlightOffer) => o.price > 0 && o.out.dep).sort((a: FlightOffer, b: FlightOffer) => a.price - b.price).slice(0, 40);
}

export async function searchDuffel(q: FlightQuery, token: string, f: typeof fetch = fetch): Promise<FlightOffer[]> {
  if (!duffelFits(q)) return [];
  const res = await f(DUFFEL_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "duffel-version": "v2", accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(duffelBody(q))
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = (data as any)?.errors?.[0]?.message || (data as any)?.errors?.[0]?.title;
    throw new Error(`Duffel ${res.status}${why ? `: ${why}` : ""}`);
  }
  return fromDuffel(data);
}
