/* KI-Reiseplaner: gemeinsame Typen für App und Such-Dienst (worker/) */
import type { FlightOffer } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";
import { BOARDS, CAT_KEYS, STYLES, type CatKey, type Prefs, type Status } from "../model";

/** Was die App schickt: Wunsch in eigenen Worten und was über die Reisenden bekannt ist */
export interface AgentRequest {
  prompt: string;
  /** Sprache für Titel und Beschreibung (de, en …) */
  lang: string;
  /** heutiges Datum (JJJJ-MM-TT), damit nichts in der Vergangenheit gesucht wird */
  today: string;
  /** Flughäfen in der Nähe des Wohnorts (IATA) */
  origins: string[];
  adults: number;
  childAges: number[];
  infants: number;
  /** schon Bekanntes aus der Reise */
  trip?: { place?: string; from?: string; to?: string };
  /** Wohnort bekannt (sonst sind origins nur die Standard-Flughäfen und die KI fragt nach dem Abflugort) */
  originsKnown?: boolean;
  /** Reisende eingetragen (sonst nimmt die KI Anzahl und Alter aus dem Wunsch oder fragt nach) */
  travelersKnown?: boolean;
  /** die KI hat in diesem Gespräch schon nachgefragt: jetzt nicht noch einmal, sondern suchen */
  asked?: boolean;
  /** Vorlieben aus Konto und Gruppe (ohne Namen) */
  prefs?: Prefs;
  /** offene Reise: die KI berät dazu und schlägt Änderungen vor, statt neue Reisen zu planen */
  current?: TripBrief;
}

/** offene Reise, knapp für die KI: ohne Namen der Reisenden, ohne Buchungsdaten */
export interface TripBrief {
  place?: string;
  country?: string;
  from?: string;
  to?: string;
  items: BriefItem[];
}

/** ein Posten der Reise: Betrag für alle, gebuchte und bezahlte darf die KI nicht ändern */
export interface BriefItem {
  id: string;
  cat: CatKey;
  name: string;
  status: Status;
  eur: number;
  estimate?: boolean;
  /** Kurzbeschreibung, z. B. Flugzeiten oder Unterkunft mit Zeitraum */
  detail?: string;
  /** eigene Anreise (Auto, Bahn) statt Flug */
  arrival?: boolean;
}

/** Antwort der KI zur offenen Reise: Text und, falls gewünscht, Änderungen (werden erst nach Bestätigung übernommen) */
export interface AgentEdit {
  reply: string;
  trip?: { place?: string; country?: string; from?: string; to?: string };
  /** Posten entfernen (Kennungen aus TripBrief) */
  remove?: string[];
  /** echte Angebote aus den Suchen, optional statt eines bisherigen Postens */
  flights?: { offer: FlightOffer; replaces?: string; seats?: number; travelers?: number }[];
  stays?: { offer: StayOffer; q: StayQuery; replaces?: string }[];
  /** Schätzungen der KI (Beträge für alle) */
  estimates?: { cat: CatKey; name: string; eur: number; replaces?: string; arrival?: boolean }[];
}

/** Anzahl der Änderungen (0: nur eine Antwort) */
export const editCount = (e: AgentEdit) =>
  (e.trip ? Object.keys(e.trip).length : 0) + (e.remove?.length || 0) + (e.flights?.length || 0) + (e.stays?.length || 0) + (e.estimates?.length || 0);

/**
 * Flug für einen Teil der Gruppe oder in kleinen Buchungen: das Angebot gilt für `seats` Plätze (so gesucht),
 * genommen für `travelers` Reisende, aufgeteilt in Buchungen zu höchstens `seats` (z. B. 10 Personen = 5 × 2 Plätze).
 */
export interface FlightBooking { offer: FlightOffer; seats: number; travelers: number }

/** Flugpreis einer Buchung für ihre Reisenden (Preis pro Platz mal Reisende) */
export const bookingPrice = (b: FlightBooking) => (b.offer.price / Math.max(1, b.seats)) * b.travelers;

/** alle Flüge eines Vorschlags zusammen */
export const flightTotal = (a: Pick<AgentTrip, "flight" | "bookings">) =>
  a.bookings?.length ? a.bookings.reduce((s, b) => s + bookingPrice(b), 0) : a.flight?.price || 0;

/** Reisende, mit denen gesucht wurde (wenn die KI sie aus dem Wunsch oder der Antwort genommen hat) */
export interface AgentParty { adults: number; childAges: number[]; infants: number }

/** ein fertiger Vorschlag; Flug und Unterkunft stammen immer aus echten Suchergebnissen */
export interface AgentTrip {
  title: string;
  summary: string;
  place: string;
  country?: string;
  from: string;
  to: string;
  flight?: FlightOffer;
  /** Flüge in mehreren Buchungen (große Gruppe, kleine Buchungen oder verschiedene Flüge); flight ist dann der erste */
  bookings?: FlightBooking[];
  stay?: StayOffer;
  /** Anfrage, mit der die Unterkunft gefunden wurde (für „Übernehmen“) */
  stayQuery?: StayQuery;
  /** Flug + Unterkunft für alle, ohne Anreise zum Flughafen */
  total: number;
  /** mit diesen Reisenden gesucht (nur, wenn die App keine kannte) */
  party?: AgentParty;
  /** Verpflegung laut Unterkunft (Selbstversorgung, Frühstück, Halbpension, Vollpension, All-inclusive) */
  board?: "self" | "breakfast" | "half" | "full" | "all";
  /** Schätzung der KI: eigene Anreise (Auto, Bahn) für alle, statt Flug */
  arrival?: { label: string; eur: number };
  /** Schätzung der KI: Transport vor Ort für alle */
  transport?: { label: string; eur: number };
  /** Schätzung der KI: Erlebnisse und Events für alle */
  extras?: { name: string; eur: number }[];
}

export interface AgentResult {
  trips: AgentTrip[];
  /** Rückfrage der KI statt Vorschlägen, mit Antworten zum Antippen */
  question?: string;
  options?: string[];
  /** Antwort zur offenen Reise (statt Vorschlägen) */
  edit?: AgentEdit;
  /** verbleibende Anfragen heute */
  remaining?: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Anfrage prüfen (im Such-Dienst, bevor Gemini gefragt wird) */
export function parseAgentRequest(b: unknown): AgentRequest | string {
  const o = (b || {}) as Record<string, unknown>;
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
  if (prompt.length < 5) return "Bitte beschreib die Reise in ein paar Worten";
  if (prompt.length > 1000) return "Beschreibung höchstens 1000 Zeichen";
  const lang = typeof o.lang === "string" && /^[a-z]{2}$/.test(o.lang) ? o.lang : "de";
  const today = typeof o.today === "string" && DATE.test(o.today) ? o.today : new Date().toISOString().slice(0, 10);
  const origins = Array.isArray(o.origins) ? o.origins.filter(x => typeof x === "string" && /^[A-Z]{3}$/.test(x)).slice(0, 6) as string[] : [];
  const adults = o.adults ?? 1, infants = o.infants ?? 0, childAges = o.childAges ?? [];
  // Gruppen bis 20 Erwachsene: Flüge sucht die KI dann in mehreren Buchungen (höchstens 9 Plätze je Buchung)
  if (!int(adults, 1, 20) || !int(infants, 0, 4)) return "Personen: 1–20 Erwachsene, bis 4 Babys";
  if (!Array.isArray(childAges) || childAges.length > 10 || !childAges.every(a => int(a, 0, 17))) return "Kinder: bis zu 10, Alter 0 bis 17";
  const t = (o.trip || {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const trip = { place: s(t.place, 80), from: s(t.from, 10), to: s(t.to, 10) };
  const prefs = parsePrefs(o.prefs);
  const current = parseBrief(o.current);
  return {
    ...(prefs ? { prefs } : {}),
    ...(current ? { current } : {}),
    prompt, lang, today, origins, adults: adults as number, childAges: childAges as number[], infants: infants as number,
    ...(trip.place || trip.from || trip.to ? { trip } : {}),
    originsKnown: o.originsKnown !== false, travelersKnown: o.travelersKnown !== false, asked: o.asked === true
  };
}

const STATUS: Status[] = ["idea", "chosen", "booked", "paid", "dropped"];

/** offene Reise prüfen: höchstens 40 Posten, kurze Texte */
export function parseBrief(v: unknown): TripBrief | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const s = (x: unknown, n: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, n) : undefined);
  const d = (x: unknown) => (typeof x === "string" && DATE.test(x) ? x : undefined);
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 40).flatMap((x: unknown): BriefItem[] => {
    const i = (x || {}) as Record<string, unknown>;
    if (typeof i.id !== "string" || !/^[\w-]{1,40}$/.test(i.id) || !(CAT_KEYS as unknown[]).includes(i.cat)) return [];
    const eur = typeof i.eur === "number" && isFinite(i.eur) ? Math.max(0, Math.min(1e6, Math.round(i.eur))) : 0;
    const detail = s(i.detail, 120);
    return [{
      id: i.id, cat: i.cat as CatKey, name: s(i.name, 60) || "", status: (STATUS as unknown[]).includes(i.status) ? i.status as Status : "idea", eur,
      ...(i.estimate === true ? { estimate: true } : {}), ...(i.arrival === true ? { arrival: true } : {}), ...(detail ? { detail } : {})
    }];
  });
  const b: TripBrief = { items };
  for (const k of ["place", "country"] as const) { const x = s(o[k], 80); if (x) b[k] = x; }
  for (const k of ["from", "to"] as const) { const x = d(o[k]); if (x) b[k] = x; }
  return b;
}

/** Vorlieben prüfen: nur bekannte Felder in erlaubten Grenzen, alles andere fällt weg */
export function parsePrefs(v: unknown): Prefs | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>, p: Prefs = {};
  const codes = (x: unknown, re: RegExp, n: number) => (Array.isArray(x) ? [...new Set(x.filter(c => typeof c === "string" && re.test(c)))].slice(0, n) as string[] : []);
  const avoid = codes(o.avoid, /^[A-Z]{2}$/, 30); if (avoid.length) p.avoid = avoid;
  if (int(o.maxStops, 0, 2)) p.maxStops = o.maxStops as number;
  if (typeof o.bags === "boolean") p.bags = o.bags;
  if (int(o.maxHours, 1, 48)) p.maxHours = o.maxHours as number;
  if (o.stayType === "whole" || o.stayType === "hotel" || o.stayType === "all") p.stayType = o.stayType;
  if (int(o.minStars, 1, 5)) p.minStars = o.minStars as number;
  if (typeof o.board === "string" && (BOARDS as string[]).includes(o.board)) p.board = o.board as Prefs["board"];
  const styles = codes(o.styles, /^[a-z]+$/, 8).filter(x => (STYLES as string[]).includes(x)); if (styles.length) p.styles = styles as Prefs["styles"];
  if (o.budget === "low" || o.budget === "mid" || o.budget === "high") p.budget = o.budget;
  if (typeof o.note === "string" && o.note.trim()) p.note = o.note.trim().slice(0, 300);
  if (typeof o.holidays === "string" && /^[A-Z]{2}$/.test(o.holidays)) p.holidays = o.holidays;
  const months = Array.isArray(o.months) ? [...new Set(o.months.filter(m => int(m, 1, 12)))] as number[] : []; if (months.length) p.months = months;
  if (int(o.nightsMin, 1, 60)) p.nightsMin = o.nightsMin as number;
  if (int(o.nightsMax, 1, 60) && (p.nightsMin == null || (o.nightsMax as number) >= p.nightsMin)) p.nightsMax = o.nightsMax as number;
  return Object.keys(p).length ? p : undefined;
}
