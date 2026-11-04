/* Treffer der Unterkunftssuche nachfiltern und sortieren (App und Such-Dienst) */
import type { StayOffer, StayQuery, StayType } from "./types";
import { roomsFit } from "./rooms";
import { kmBetween } from "../geo/places";

/** im Umkreis (#680): mit Umkreis und Mittelpunkt nur Treffer mit Lage, höchstens so weit entfernt */
export const inRadius = (o: Pick<StayOffer, "lat" | "lon">, q: Partial<Pick<StayQuery, "radiusKm" | "lat" | "lon">>): boolean =>
  !q.radiusKm || q.lat == null || q.lon == null || (o.lat != null && o.lon != null && kmBetween({ lat: q.lat, lon: q.lon }, { lat: o.lat, lon: o.lon }) <= q.radiusKm);

export type StaySort = "price" | "rating" | "center" | "family";

/** „Split, 0.7 km bis Zentrum“ → 0,7; ohne Angabe undefined */
export function centerKm(o: Pick<StayOffer, "place">): number | undefined {
  const m = (o.place || "").match(/(\d+(?:[.,]\d+)?)\s*km\b/i);
  return m ? +m[1].replace(",", ".") : undefined;
}

/** Familienhotel laut Name (Familotel, Familienhotel, Kinderhotel, „Family“) (#683) */
export const FAMILY_NAME = /famil|kinderhotel|kids|kinderland/i;

/** Punkte für Familien: Familienhotel, Rutsche, Pool, Hallenbad, Familienzimmer, Küche, Strand, Garten, gute Bewertung */
export function familyScore(o: Pick<StayOffer, "facts" | "score"> & { name?: string }): number {
  const f = o.facts || [];
  const pts: Record<string, number> = { Wasserrutsche: 3, Pool: 3, Hallenbad: 2, Familienzimmer: 3, Küche: 2, Strand: 2, Garten: 1, Waschmaschine: 1 };
  return f.reduce((s, x) => s + (pts[x] || 0), 0) + (o.score || 0) / 2 + (o.name && FAMILY_NAME.test(o.name) ? 4 : 0);
}

/** was die Anbieter trotz Filter liefern: zu wenig Sterne oder zu schwache Bewertung fliegt raus */
export function keepStays(list: StayOffer[], q: Pick<StayQuery, "minStars" | "minScore"> & Partial<Pick<StayQuery, "bedroomsMin" | "sleepsMin" | "radiusKm" | "lat" | "lon">> & { type?: StayType }): StayOffer[] {
  // Ferienwohnungen und Häuser haben keine Sterne: bei „ganze Unterkunft“ gilt der Filter nicht, bei „alles“ nur für Hotels
  const starsOk = (o: StayOffer) => !q.minStars || q.type === "whole" || (q.type === "all" && !o.stars) || (o.stars || 0) >= q.minStars;
  return list.filter(o => starsOk(o) && (!q.minScore || o.score == null || o.score >= q.minScore) && roomsFit(o, q) && inRadius(o, q));
}

/** Testangebote (Sandbox, keine echten Preise) immer hinter die echten, sonst stehen sie bei „Günstigste“ oben */
export const realFirst = <T extends { test?: boolean }>(l: T[]): T[] => [...l.filter(o => !o.test), ...l.filter(o => o.test)];

export function sortStays(list: StayOffer[], by: StaySort): StayOffer[] {
  return realFirst(sortStaysBy(list, by));
}
function sortStaysBy(list: StayOffer[], by: StaySort): StayOffer[] {
  const l = [...list];
  if (by === "rating") return l.sort((a, b) => (b.score || 0) - (a.score || 0) || a.total - b.total);
  if (by === "center") return l.sort((a, b) => (centerKm(a) ?? Infinity) - (centerKm(b) ?? Infinity) || a.total - b.total);
  if (by === "family") return l.sort((a, b) => familyScore(b) - familyScore(a) || a.total - b.total);
  return l.sort((a, b) => a.total - b.total);
}
