/*
 * Reisekatalog (#641, #642): ein Eintrag ist nur der Reisekern am Ziel, ohne Anreise. Die Anreise schätzt die App je
 * Betrachter aus dessen Wohnort (#645). Keine Namen, Alter, Wohnorte, Buchungsnummern, Zahlungen, Anbieternamen oder
 * Links (#649); Reisende nur als Anzahl je Altersklasse. Preise pro Person in Euro, mit Stand.
 */
import type { Board, CatKey, FoodStyle, NoteKind, TravelStyle } from "../model";

/**
 * stay: ein Ziel (Ferienhaus, Städtetrip …), round: Rundreise mit mehreren Stationen, road: mit Auto oder Camper
 * unterwegs (Anreise gehört zur Route), event: Anlass (Festival, Konzert), package: Pauschalreise, cruise: Kreuzfahrt
 */
export type CatalogKind = "stay" | "round" | "road" | "event" | "package" | "cruise";
export const CATALOG_KINDS: CatalogKind[] = ["stay", "round", "road", "event", "package", "cruise"];

/** Herkunft: von Nutzern veröffentlicht, Routine „SAF 10 – Reiseideen“ (#651), Reiseideen-Seiten (seo/pages.ts) */
export type CatalogSource = "user" | "auto" | "idea";

/** Unterwegs vor Ort */
export type CatalogMove = "car" | "camper" | "transit";

export interface CatalogStop {
  place: string;
  /** Land (ISO-2), wenn bekannt */
  cc?: string;
  /** Lage: Grundlage für Entfernung und Sortierung; fehlt sie, kann der Eintrag nicht sortiert werden (Check #643) */
  lat?: number;
  lon?: number;
  nights: number;
}

/** Kosten am Ziel pro Person (Mittelwert über alle Reisenden), ohne Anreise und ohne Touren */
export interface CatalogCost {
  cat: CatKey;
  /** Richtwert pro Person in € */
  pp: number;
  /** Spanne pro Person in €, wenn bekannt */
  range?: [number, number];
  /** nur bei gepflegten Einträgen (Reiseideen, Routine); bei Nutzer-Einträgen bildet die Ansicht den Text */
  label?: string;
  /** Unterkunft: Ort (Station), Nächte, Verpflegung */
  place?: string;
  nights?: number;
  board?: Board;
  /** automatisch geschätzt (Verpflegung, Transport vor Ort) */
  auto?: "food" | "local";
}

/** Tour oder Erlebnis: zählt nicht zum Richtpreis, einzeln oder mit dem Tagesplan übernehmbar (#647) */
export interface CatalogTour {
  name: string;
  pp?: number;
  range?: [number, number];
  /** Tag der Reise (1 = erster Tag) und Uhrzeit */
  day?: number;
  time?: string;
}

export interface CatalogNote { text: string; kind?: NoteKind; time?: string }
export interface CatalogDay { n: number; title?: string; notes: CatalogNote[] }

export interface CatalogEntry {
  v: 1;
  id: string;
  source: CatalogSource;
  /** öffentlicher Benutzername des Erstellers (#650); bei Routine und Reiseideen leer */
  by?: string;
  /** Sprache der Texte */
  lang: string;
  title: string;
  summary?: string;
  kind: CatalogKind;
  styles?: TravelStyle[];
  /** ausdrücklich ohne Flug (Bahn, Auto, Camper): die Anreise wird dann nie als Flug geschätzt */
  noFly?: boolean;
  /** Anlass (nur der Name, kein Termin) */
  event?: string;
  group: { adults: number; children: number; infants: number };
  /** gute Monate (1–12) */
  months: number[];
  nights: number;
  stops: CatalogStop[];
  move?: CatalogMove[];
  food?: FoodStyle;
  costs: CatalogCost[];
  tours: CatalogTour[];
  days: CatalogDay[];
  /** Stand der Preise (JJJJ-MM) */
  stand: string;
  /** Reiseidee-Seite (/reise/<slug>/) */
  slug?: string;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Richtwert pro Person am Ziel (ohne Anreise und Touren) */
export const corePP = (e: CatalogEntry) => Math.round(sum(e.costs.map(c => c.pp)));
/** alle Touren pro Person */
export const toursPP = (e: CatalogEntry) => Math.round(sum(e.tours.map(x => x.pp || 0)));
export const persons = (e: CatalogEntry) => e.group.adults + e.group.children + e.group.infants;

/** grobe Formprüfung (der Plausibilitätscheck #643 prüft die Reise selbst) */
export function shapeErrors(e: CatalogEntry): string[] {
  const err: string[] = [];
  if (e.v !== 1) err.push("v");
  if (!e.id) err.push("id");
  if (!e.title.trim()) err.push("title");
  if (!e.stops.length) err.push("stops");
  if (e.stops.some(s => !s.place.trim() || s.nights < 0)) err.push("stop");
  if (!(e.nights >= 0)) err.push("nights");
  if (persons(e) < 1) err.push("group");
  if (e.months.some(m => !Number.isInteger(m) || m < 1 || m > 12)) err.push("months");
  if (e.costs.some(c => !(c.pp >= 0))) err.push("cost");
  if (e.costs.some(c => c.range && (c.range[0] > c.range[1] || c.pp < c.range[0] || c.pp > c.range[1]))) err.push("range");
  if (!/^\d{4}-\d{2}$/.test(e.stand)) err.push("stand");
  return err;
}
