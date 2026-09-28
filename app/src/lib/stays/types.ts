/* Unterkunftssuche: gemeinsame Typen für App und Such-Dienst (worker/) */
import type { SourceStatus } from "../flights/types";

export type StayType = "whole" | "hotel" | "all";

export interface StayQuery {
  /** Ort, z. B. „Split“ */
  place: string;
  /** Land zur Unterscheidung (Paris, Frankreich statt Paris, Texas) */
  country?: string;
  /** JJJJ-MM-TT */
  checkin: string;
  checkout: string;
  adults: number;
  /** Alter der Kinder (0–17) */
  childAges: number[];
  rooms: number;
  /** ganze Unterkunft (Wohnung, Haus), Hotel oder alles */
  type: StayType;
  /** nur diese Quellen fragen; fehlt: alle */
  sources?: string[];
  currency?: string;
}

export interface StayOffer {
  id: string;
  /** Quelle, z. B. "booking" */
  source: string;
  sourceName: string;
  /** bei Vergleichsportalen: der günstigste Anbieter, z. B. „Airbnb“ */
  via?: string;
  name: string;
  /** Gesamtpreis für den ganzen Aufenthalt, alle Gäste */
  total: number;
  currency: string;
  url?: string;
  /** Gästebewertung 0–10 */
  score?: number;
  reviews?: number;
  stars?: number;
  /** Stadtteil, Ort */
  place?: string;
  lat?: number;
  lon?: number;
  image?: string;
  /** wenige Merkmale, z. B. Küche, Pool */
  facts?: string[];
  /** direkt in der App buchbar (später) */
  bookable?: boolean;
}

export interface StaySearchResult {
  offers: StayOffer[];
  sources: SourceStatus[];
}
