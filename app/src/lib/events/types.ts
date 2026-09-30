/* Event-Suche: gemeinsame Typen für App und Such-Dienst (worker/) */
import type { SourceStatus } from "../flights/types";

export interface EventQuery {
  /** Mannschaft, Künstler, Festival …; leer, wenn nach Ort gesucht wird */
  q: string;
  /** „Was läuft vor Ort“: Stadt der Reise (auch englisch, z. B. „Mailand“/„Milan“), Land, Mitte; dann ist q optional */
  city?: string;
  cityEn?: string;
  cc?: string;
  lat?: number;
  lon?: number;
  /** Zeitraum JJJJ-MM-TT (fehlt: ab heute, ein Jahr) */
  from?: string;
  to?: string;
}

export interface EventHit {
  id: string;
  source: string;
  sourceName: string;
  name: string;
  /** Beginn in Ortszeit, z. B. 2027-05-15T20:00; ohne Uhrzeit nur das Datum */
  start: string;
  venue?: string;
  city?: string;
  /** Ländercode (GB, DE …) */
  cc?: string;
  /** Anschrift, falls keine Stadt bekannt ist */
  address?: string;
  lat?: number;
  lon?: number;
  url?: string;
  /** z. B. Premier League, Musik */
  category?: string;
  /** Ticketpreise, soweit die Quelle sie nennt */
  price?: { min: number; max?: number; currency: string };
}

export interface EventSearchResult {
  events: EventHit[];
  sources: SourceStatus[];
}

/** Schlüssel des Such-Dienstes (Cloudflare-Secrets); fehlt einer, bleibt die Quelle aus */
export interface EventEnv { TICKETMASTER_KEY?: string; FOOTBALL_DATA_KEY?: string }
