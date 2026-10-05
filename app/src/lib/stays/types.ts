/* Unterkunftssuche: gemeinsame Typen für App und Such-Dienst (worker/) */
import type { SourceStatus } from "../flights/types";

export type StayType = "whole" | "hotel" | "all";

/** Ausstattung, nach der gefiltert wird (an die Anbieter weitergegeben) */
export const STAY_MUSTS = ["pool", "breakfast", "kitchen", "aircon", "parking", "freeCancel"] as const;
export type StayMust = (typeof STAY_MUSTS)[number];

export interface StayQuery {
  /** Ort, z. B. „Split“ */
  place: string;
  /** Land zur Unterscheidung (Paris, Frankreich statt Paris, Texas) */
  country?: string;
  /** Land als ISO-Code (ES), für Anbieter, die ihn brauchen (liteAPI) */
  cc?: string;
  /** Mittelpunkt des Orts, für Anbieter, die im Umkreis suchen (liteAPI, wenn der Name nicht passt) */
  lat?: number;
  lon?: number;
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
  /** muss vorhanden sein (z. B. Pool, Frühstück inklusive) */
  must?: StayMust[];
  /** mindestens so viele Sterne (1–5) */
  minStars?: number;
  /** mindestens diese Gästebewertung (0–10, z. B. 8) */
  minScore?: number;
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
  /** Preis in der Währung des Anbieters, falls umgerechnet */
  orig?: { amount: number; currency: string };
  /** aus einem Testzugang (Sandbox): kein echter Preis */
  test?: boolean;
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
  /** Verpflegung, falls der Anbieter sie nennt */
  board?: "self" | "breakfast" | "half" | "full" | "all";
  /** Steuern und Gebühren laut Anbieter (im Preis enthalten oder vor Ort zu zahlen), in der Währung des Angebots */
  fees?: { label: string; amount: number; included: boolean }[];
  /** direkt in der App buchbar (später) */
  bookable?: boolean;
}

export interface StaySearchResult {
  offers: StayOffer[];
  sources: SourceStatus[];
}
