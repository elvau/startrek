/* Booking.com und Trivago über ihre MCP-Server */
import { callTool } from "../mcp";
import type { StayOffer, StayQuery } from "./types";

export const TRIVAGO_MCP = "https://mcp.trivago.com/mcp";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** „2.575€“, „1,889“, 840 → Zahl (Punkt oder Komma als Tausender, bis zwei Nachkommastellen) */
export function priceNum(v: unknown): number {
  if (typeof v === "number") return v;
  const m = String(v ?? "").match(/(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/);
  if (!m) return NaN;
  return +m[1].replace(/[.,]/g, "") + (m[2] ? +("0." + m[2]) : 0);
}

/** wenige, für Familien und Gruppen wichtige Merkmale */
const FACTS: [string, RegExp][] = [
  ["Küche", /küche|kitchen/i], ["Pool", /pool/i], ["Parkplatz", /parkpl|parking/i], ["Klimaanlage", /klimaanlage|air ?condition/i],
  ["Familienzimmer", /familienzimmer|family room/i], ["Waschmaschine", /waschmaschine|washing/i], ["Strand", /strand|beach/i], ["Garten", /garten|garden/i]
];
export function factsOf(list: string[]): string[] {
  return FACTS.filter(([, re]) => list.some(f => re.test(f))).map(([l]) => l).slice(0, 4);
}

/** Verpflegung aus Merkmalen oder Name („All Inclusive“, „Halbpension“, „Frühstück inklusive“); Frühstück nur, wenn inklusive */
export function boardOf(list: string[], name = ""): StayOffer["board"] {
  // nur buchbar, nicht inklusive: zählt nicht
  const all = [...list, name].filter(x => !/möglich|zubuchbar|optional|available|on request|gegen aufpreis|surcharge/i.test(x)).join(" | ");
  if (/all[\s-]?inclusive|all[\s-]?inklusive|alles inklusive|todo incluido|tout compris/i.test(all)) return "all";
  if (/vollpension|full board|pensión completa|pension complète/i.test(all)) return "full";
  if (/halbpension|half board|media pensión|demi-pension/i.test(all)) return "half";
  if (/(frühstück|breakfast|desayuno|petit[\s-]déjeuner)[^|]*(inkl|inclu|gratis|free)|(inkl|inclu|gratis|free)[^|]*(frühstück|breakfast)/i.test(all)) return "breakfast";
  return undefined;
}

const place = (...p: unknown[]) => p.filter(x => typeof x === "string" && x).join(", ") || undefined;
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : v != null && v !== "" && isFinite(+v!) ? +v! : undefined);

/* ---------- Booking.com ---------- */

export function bookingArgs(q: StayQuery) {
  return {
    destination: q.country ? `${q.place}, ${q.country}` : q.place,
    checkin_date: q.checkin, checkout_date: q.checkout,
    number_of_adults: q.adults, number_of_rooms: q.rooms,
    ...(q.childAges.length ? { children_ages: q.childAges } : {}),
    ...(q.type === "whole" ? { accommodation_types: ["HOLIDAY_HOME", "APARTMENT", "VILLA"] } : q.type === "hotel" ? { accommodation_types: ["HOTEL", "GUEST_HOUSE"] } : {}),
    user_country_code: "de", user_locale: "de", currency: q.currency || "EUR"
  };
}

export function fromBooking(data: any, currency = "EUR"): StayOffer[] {
  return (data?.accommodations || []).map((a: any): StayOffer => ({
    id: "booking:" + a.id, source: "booking", sourceName: "Booking.com",
    name: a.name || "?", total: priceNum(a.price?.book), currency: a.price?.currency || currency, url: a.url,
    score: num(a.rating?.review_score), reviews: num(a.rating?.number_of_reviews), stars: num(a.rating?.stars) || undefined,
    place: place(a.location?.district_name, a.location?.city_name),
    lat: num(a.location?.coordinates?.latitude), lon: num(a.location?.coordinates?.longitude),
    facts: factsOf(a.facilities || []), board: boardOf([...(a.facilities || []), ...(a.meal_plan ? [String(a.meal_plan)] : [])], a.name)
  })).filter((o: StayOffer) => o.total > 0);
}

export async function searchBooking(q: StayQuery, url: string, f: typeof fetch = fetch): Promise<StayOffer[]> {
  return fromBooking(await callTool(url, "accommodations_search", bookingArgs(q), "Booking.com", f), q.currency);
}

/* ---------- Trivago (vergleicht viele Portale, z. B. Airbnb, CHECK24, Booking.com) ---------- */

export function trivagoArgs(q: StayQuery) {
  return {
    query: q.place, arrival: q.checkin, departure: q.checkout,
    adults: q.adults, children: q.childAges.length, ...(q.childAges.length ? { children_ages: q.childAges.join("-") } : {}),
    rooms: Math.min(q.rooms, q.adults), country: "DE", currency: q.currency || "EUR", language: "DE_DE"
  };
}

export function fromTrivago(data: any, q?: Pick<StayQuery, "type">): StayOffer[] {
  return (data?.accommodations || []).map((a: any) => {
    const amen = String(a.top_amenities || "").split(/,\s*/).filter(Boolean);
    // Trivago kennt keinen Filter nach Art: ganze Unterkunft = mit Küche, Hotel = mit Sternen
    const kind = amen.some(x => /küche|kitchen/i.test(x)) ? "whole" : a.hotel_rating > 0 ? "hotel" : undefined;
    const o: StayOffer & { kind?: string } = {
      id: "trivago:" + a.accommodation_id, source: "trivago", sourceName: "Trivago", via: a.advertisers || undefined,
      name: a.accommodation_name || "?", total: priceNum(a.price_per_stay), currency: a.currency || "EUR", url: a.accommodation_url,
      score: num(a.review_rating), reviews: num(priceNum(a.review_count)), stars: num(a.hotel_rating) || undefined,
      place: a.distance || a.country_city || undefined, lat: num(a.latitude), lon: num(a.longitude), image: a.main_image || undefined,
      facts: factsOf(amen), board: boardOf(amen, a.accommodation_name), kind
    };
    return o;
  }).filter((o: StayOffer & { kind?: string }) => o.total > 0 && !(q?.type === "whole" && o.kind === "hotel") && !(q?.type === "hotel" && o.kind === "whole"))
    .map(({ kind: _k, ...o }: StayOffer & { kind?: string }) => o);
}

export async function searchTrivago(q: StayQuery, url = TRIVAGO_MCP, f: typeof fetch = fetch): Promise<StayOffer[]> {
  return fromTrivago(await callTool(url, "trivago-accommodation-search", trivagoArgs(q), "Trivago", f), q);
}
