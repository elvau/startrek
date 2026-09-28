/* Flugsuche: gemeinsame Typen für App und Such-Dienst (worker/) */

export interface FlightQuery {
  /** Abflug: IATA-Code, Stadt oder Flughafen */
  from: string;
  to: string;
  /** JJJJ-MM-TT */
  depart: string;
  /** fehlt: nur Hinflug */
  ret?: string;
  /**
   * Flexibel statt fester Daten: depart ist die früheste Abreise, latest die späteste Rückkehr (wieder zu Hause),
   * dazwischen nightsMin bis nightsMax Nächte am Ziel. ret wird dann nicht benutzt.
   */
  latest?: string;
  nightsMin?: number;
  nightsMax?: number;
  /** feste Daten: ± so viele Tage um Hin- und Rückflug (0–3) */
  flexDays?: number;
  /** höchstens so viele Umstiege je Richtung (0–2) */
  maxStops?: number;
  /** ein Koffer pro Erwachsenem und Kind */
  bags?: boolean;
  /** Verbindungen aus getrennten Tickets („Self-Transfer“) erlauben */
  selfTransfer?: boolean;
  adults: number;
  children: number;
  infants: number;
  currency?: string;
}

export interface OfferLeg {
  from: string;
  to: string;
  fromCity?: string;
  toCity?: string;
  /** ISO lokal */
  dep: string;
  arr: string;
  minutes: number;
  stops: number;
  /** Flughäfen inkl. Umstiege */
  route: string[];
  carriers: string[];
  flights: string[];
}

export interface FlightOffer {
  id: string;
  /** Quelle, z. B. "kiwi" */
  source: string;
  sourceName: string;
  /** Gesamtpreis für alle Reisenden */
  price: number;
  currency: string;
  url?: string;
  out: OfferLeg;
  back?: OfferLeg;
  baggage?: { personal: number; cabin: number; checked: number };
  /** direkt in der App buchbar (später) */
  bookable?: boolean;
}

export interface SourceStatus {
  id: string;
  name: string;
  /** eingerichtet (Schlüssel vorhanden) */
  configured: boolean;
  ok: boolean;
  count: number;
  ms?: number;
  error?: string;
}

export interface SearchResult {
  offers: FlightOffer[];
  sources: SourceStatus[];
}
