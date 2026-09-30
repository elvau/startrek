/* Touren und Tickets vor Ort (Viator): gemeinsame Typen für App und Such-Dienst (worker/) */
import type { SourceStatus } from "../flights/types";

export interface ActivityQuery {
  /** Reiseort, z. B. „Barcelona“ */
  place: string;
  /** Reisezeitraum JJJJ-MM-TT (optional) */
  from?: string;
  to?: string;
  /** Sprache der Texte (App-Sprache) */
  lang?: string;
}

export interface ActivityHit {
  id: string;
  source: string;
  sourceName: string;
  title: string;
  description?: string;
  image?: string;
  /** Bewertung 0–5 und Zahl der Bewertungen */
  rating?: number;
  reviews?: number;
  /** Dauer in Minuten (bei Spannen die kürzeste) */
  minutes?: number;
  /** Preis ab, pro Person */
  price?: number;
  currency: string;
  url?: string;
}

export interface ActivitySearchResult {
  activities: ActivityHit[];
  sources: SourceStatus[];
}

/** Schlüssel des Such-Dienstes (Cloudflare-Secret); fehlt er, bleibt die Suche aus */
export interface ActivityEnv { VIATOR_API_KEY?: string }
