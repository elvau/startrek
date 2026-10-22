/*
 * Import (#458): Sicherheit je Angabe und Rückfragen. Die KI nennt je Angabe, wie sicher sie ist (1 = so gelesen,
 * 0.6 = abgeleitet, 0.3 = geraten). Niedrig → kurze Rückfrage vor dem Anlegen (Antworten zum Antippen, „Weiß nicht“
 * erlaubt), mittel → anlegen und Posten als „bitte prüfen“ markieren, alles hoch → direkt anlegen.
 */
import { AGE, type Board } from "../model";
import type { ConfKey, ImportedOffer } from "./ai";

export type Level = "high" | "mid" | "low";
/** ohne Angabe der KI zählt eine erkannte Angabe als abgeleitet */
export const levelOf = (c: number | undefined): Level => (c == null ? "mid" : c >= 0.85 ? "high" : c >= 0.6 ? "mid" : "low");

export type QuestionId = "baggage" | "transfer" | "board" | "people";
export const DUNNO = "dunno";
/** Antworten je Frage (Kennungen; Texte in der App) */
export const ANSWERS: Record<QuestionId, string[]> = {
  baggage: ["checked", "cabin", DUNNO],
  transfer: ["yes", "no", DUNNO],
  board: ["self", "breakfast", "half", "all", DUNNO],
  // Personen: Zähler für Erwachsene, Kinder, Kleinkinder statt fester Antworten (suggestParty, setParty)
  people: []
};

export interface ReviewField { key: ConfKey; level: Level }
export interface Review { fields: ReviewField[]; questions: QuestionId[]; overall: number; direct: boolean }

const has = (o: ImportedOffer, k: ConfKey): boolean => ({
  place: !!o.place,
  dates: !!(o.from || o.to),
  people: !!(o.adults || o.travelers?.length),
  price: !!o.price,
  flights: !!o.flights,
  stay: !!o.stay,
  cruise: !!o.cruise,
  board: !!o.stay?.board,
  baggage: !!o.flights?.baggage,
  transfer: o.transfer?.included != null || !!o.transfer?.price
})[k];

/** Felder in der Reihenfolge der Anzeige */
const ORDER: ConfKey[] = ["place", "dates", "people", "price", "flights", "cruise", "stay", "board", "baggage", "transfer"];

/** Übersicht: erkannte Angaben mit Stufe, offene Rückfragen, Gesamtwert (0–100), ob direkt angelegt werden kann */
export function reviewOf(o: ImportedOffer, answered: ReadonlySet<QuestionId> = new Set(), peopleKnown = false): Review {
  const c = o.confidence || {};
  const fields = ORDER.filter(k => has(o, k)).map(key => ({ key, level: levelOf(c[key]) }));
  const low = (k: ConfKey) => !has(o, k) || levelOf(c[k]) === "low";
  const pkg = !!(o.flights && (o.stay || o.cruise));
  const q: QuestionId[] = [];
  // auch bei nur geratener Anzahl nachfragen, vorbelegt mit dem Vorschlag der KI
  if (!peopleKnown && low("people")) q.push("people");
  if (o.flights && low("baggage")) q.push("baggage");
  if (pkg && low("transfer")) q.push("transfer");
  if (o.stay && low("board")) q.push("board");
  const questions = q.filter(id => !answered.has(id));
  // Gesamtwert: Mittel der gezeigten Angaben (ohne Angabe der KI 0,6)
  const vals = fields.map(f => c[f.key] ?? 0.6);
  const overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : 0;
  const direct = !questions.length && answered.size === 0 && q.length === 0 && fields.every(f => f.level === "high");
  return { fields, questions, overall, direct };
}

/** Antwort einarbeiten: Angabe gilt danach als sicher; „Weiß nicht“ bleibt offen (Realitätscheck rechnet eine Spanne) */
export function answer(o: ImportedOffer, id: QuestionId, value: string): ImportedOffer {
  const out: ImportedOffer = JSON.parse(JSON.stringify(o));
  out.confidence ||= {};
  if (value === DUNNO) { if (id !== "people") out.confidence[id] = Math.min(out.confidence[id] ?? 0.3, 0.3); return out; }
  if (id === "people") { out.adults = Number(value); out.confidence.people = 1; }
  if (id === "baggage" && out.flights) { out.flights.baggage = { cabin: 1, checked: value === "checked" ? 1 : 0 }; out.confidence.baggage = 1; }
  if (id === "transfer") { out.transfer = { ...(out.transfer || {}), included: value === "yes" }; out.confidence.transfer = 1; }
  if (id === "board" && out.stay) { out.stay.board = value as Board; out.confidence.board = 1; }
  return out;
}

/** Posten, die als „bitte prüfen“ markiert werden: zugehörige Angaben nur abgeleitet oder geraten */
export function checks(o: ImportedOffer): { flights: boolean; stay: boolean; cruise: boolean; transfer: boolean } {
  const c = o.confidence || {};
  const unsure = (...ks: ConfKey[]) => ks.some(k => has(o, k) && levelOf(c[k]) !== "high");
  const main = o.stay || o.cruise;
  const pkg = !!(o.flights && main && !o.flights.price && !o.stay?.price);
  return {
    flights: unsure("flights", "baggage", "dates") || (!pkg && unsure("price") && !main),
    stay: unsure("stay", "board", "dates") || (!o.cruise && (pkg || !o.flights) && unsure("price")),
    cruise: !!o.cruise && (unsure("cruise", "dates") || ((pkg || !o.flights) && unsure("price"))),
    transfer: unsure("transfer")
  };
}

export interface Party { adults: number; kids: number; infants: number }
/** Flug-Regel (#483): Kleinkind unter 2, Kind 2–11, ab 12 zählt man als Erwachsener */
const isInfant = (a: number) => a < AGE.child, isKid = (a: number) => a >= AGE.child && a < AGE.adult;

/** Erwachsene, Kinder und Kleinkinder laut Angebot (Alter, nur Anzahl oder in der Übersicht eingetragen) */
export function partyOf(o: ImportedOffer): Party {
  const ages = o.childAges || [];
  const teens = ages.filter(a => a >= AGE.adult).length;
  const infants = Math.max(o.infants || 0, ages.filter(isInfant).length);
  const minors = Math.max(ages.length - teens, (o.children || 0) - teens, infants + ages.filter(isKid).length);
  return { adults: (o.adults || (minors || teens ? 1 : 0)) + teens, kids: minors - infants, infants };
}

/** Vorbelegung der Rückfrage: was die KI gelesen hat, sonst 2 Erwachsene (häufigster Fall bei Angeboten) */
export function suggestParty(o: ImportedOffer): Party {
  const p = partyOf(o);
  if (o.adults) return p;
  // ohne Erwachsene: 2 statt der 1 aus partyOf, Jugendliche ab 12 zählen weiter dazu
  const teens = (o.childAges || []).filter(a => a >= AGE.adult).length;
  return { ...p, adults: 2 + teens };
}

/** Anzahl in der Übersicht ändern (#474): bekannte Alter bleiben, soweit sie noch passen; gilt dann als sicher */
export function setParty(o: ImportedOffer, p: Party): ImportedOffer {
  const ages = o.childAges || [];
  const childAges = [...ages.filter(isKid).slice(0, p.kids), ...ages.filter(isInfant).slice(0, p.infants)];
  const out: ImportedOffer = { ...o, adults: Math.max(1, p.adults), children: p.kids + p.infants, infants: p.infants, confidence: { ...(o.confidence || {}), people: 1 } };
  if (childAges.length) out.childAges = childAges; else delete out.childAges;
  if (!p.kids && !p.infants) { delete out.children; delete out.infants; }
  return out;
}
