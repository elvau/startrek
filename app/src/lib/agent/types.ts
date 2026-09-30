/* KI-Reiseplaner: gemeinsame Typen für App und Such-Dienst (worker/) */
import type { FlightOffer } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";
import { BOARDS, STYLES, type Prefs } from "../model";

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
}

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
  stay?: StayOffer;
  /** Anfrage, mit der die Unterkunft gefunden wurde (für „Übernehmen“) */
  stayQuery?: StayQuery;
  /** Flug + Unterkunft für alle, ohne Anreise zum Flughafen */
  total: number;
  /** mit diesen Reisenden gesucht (nur, wenn die App keine kannte) */
  party?: AgentParty;
  /** Verpflegung laut Unterkunft (Selbstversorgung, Frühstück, Halbpension, Vollpension, All-inclusive) */
  board?: "self" | "breakfast" | "half" | "full" | "all";
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
  if (!int(adults, 1, 9) || !int(infants, 0, 4)) return "Personen: 1–9 Erwachsene, bis 4 Babys";
  if (!Array.isArray(childAges) || childAges.length > 8 || !childAges.every(a => int(a, 0, 17))) return "Kinder: bis zu 8, Alter 0 bis 17";
  const t = (o.trip || {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const trip = { place: s(t.place, 80), from: s(t.from, 10), to: s(t.to, 10) };
  const prefs = parsePrefs(o.prefs);
  return {
    ...(prefs ? { prefs } : {}),
    prompt, lang, today, origins, adults: adults as number, childAges: childAges as number[], infants: infants as number,
    ...(trip.place || trip.from || trip.to ? { trip } : {}),
    originsKnown: o.originsKnown !== false, travelersKnown: o.travelersKnown !== false, asked: o.asked === true
  };
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
