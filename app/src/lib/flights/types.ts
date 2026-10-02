/* Flugsuche: gemeinsame Typen für App und Such-Dienst (worker/) */

export interface FlightQuery {
  /** Abflug: IATA-Code, Stadt oder Flughafen */
  from: string;
  to: string;
  /**
   * Auswahl aus der Liste als Codes: ein Flughafen (HND), alle einer Stadt (JFK, EWR, LGA) oder alle im Umkreis
   * (SPU, BWK, DBV). Anbieter mit Listen (Kiwi) fragen einmal, andere je Code. Treffer an anderen Flughäfen fallen raus.
   */
  fromAirports?: string[];
  toAirports?: string[];
  /** Stadt-Code, falls die Liste genau eine Stadt ist (TYO): dann reicht bei Travelpayouts eine Anfrage */
  fromCityCode?: string;
  toCityCode?: string;
  /** JJJJ-MM-TT */
  depart: string;
  /** fehlt: nur Hinflug */
  ret?: string;
  /** nur Hinflug mit Zeitfenster: Abflug zwischen depart und departTo (JJJJ-MM-TT) */
  departTo?: string;
  /**
   * Gabelflug mit langem Umstieg (ein Ticket): nur über diese Flughäfen umsteigen, Aufenthalt viaHours[0]–viaHours[1] Stunden.
   * Nur Kiwi kann das; andere Quellen bleiben dann still.
   */
  via?: string[];
  viaHours?: [number, number];
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
  /** Koffer insgesamt (aufgegeben), auf die Reisenden verteilt; geht vor „bags“ */
  bagCount?: number;
  /** Verbindungen aus getrennten Tickets („Self-Transfer“) erlauben */
  selfTransfer?: boolean;
  /** gesperrte Länder (ISO): dort nicht umsteigen */
  avoidCountries?: string[];
  /** höchstens so viele Stunden Flugzeit je Richtung */
  maxHours?: number;
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
  /** Umstiege mit Aufenthalt in Stunden (Kiwi) */
  layovers?: { at: string; hours: number }[];
}

export interface FlightOffer {
  id: string;
  /** Quelle, z. B. "kiwi" */
  source: string;
  sourceName: string;
  /** Gesamtpreis für alle Reisenden */
  price: number;
  currency: string;
  /** Preis in der Währung des Anbieters, falls umgerechnet (z. B. 512 GBP) */
  orig?: { amount: number; currency: string };
  /** aus einem Testzugang (Sandbox): kein echter Preis */
  test?: boolean;
  url?: string;
  /** Link mit Partner-Kennung (Provision bei Buchung), in der App als „Partner“ gekennzeichnet */
  sponsored?: boolean;
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
  /** Testzugang (Sandbox): Preise sind nicht echt */
  test?: boolean;
}

export interface SearchResult {
  offers: FlightOffer[];
  sources: SourceStatus[];
}
