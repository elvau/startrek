/* Datenmodell der Reisekasse. Siehe docs/KONZEPT.md, Abschnitte 2 und 4. */

export type CatKey = "flights" | "stay" | "transport" | "attractions" | "misc";
export const CAT_KEYS: CatKey[] = ["flights", "stay", "transport", "attractions", "misc"];

/** Idee → Gewählt → Gebucht → Bezahlt, oder Verworfen */
export type Status = "idea" | "chosen" | "booked" | "paid" | "dropped";
export const FIXED: Status[] = ["booked", "paid"];

export type AgeClass = "adult" | "child" | "infant";

export interface Traveler {
  id: string;
  /** Vorname */
  name: string;
  /** Alter zum Reisezeitpunkt */
  age: number;
  /** Familie bzw. Haushalt; bei Personen aus Gruppen der Nachname */
  household: string;
  color?: string;
  /** false: für diese Reise nicht dabei (zählt nirgends mit) */
  active?: boolean;
  /** gespeicherte Person, aus der dieser Reisende stammt */
  personId?: string;
}

/** Gespeicherte Person (im Konto), unabhängig von Reisen */
export interface Person {
  id: string;
  first: string;
  last: string;
  age?: number;
}

/** Gespeicherte Gruppe, z. B. Familie oder Kegelclub. Eine Person kann in mehreren Gruppen sein. */
export interface Group {
  id: string;
  name: string;
  memberIds: string[];
}

export interface Directory {
  people: Person[];
  groups: Group[];
}

export interface Tier {
  /** ab so vielen Personen */
  min: number;
  /** Rabatt in Prozent */
  pct: number;
}

/**
 * Preis einer Option.
 * - "person": Preis pro Person je Altersklasse, mal Menge (z. B. Tage)
 * - "unit": Pauschale pro Einheit (Zimmer, Auto, Apartment), gleichmäßig auf die Beteiligten verteilt
 */
export interface Price {
  mode: "person" | "unit";
  /** Unterkunft mit Zeitraum: Preis gilt pro Nacht (Standard) oder für den ganzen Aufenthalt */
  basis?: "night" | "stay";
  currency: string;
  /** Menge, z. B. Nächte, Tage, Fahrten. Standard 1 */
  qty?: number;
  adult?: number;
  /** fehlt: Erwachsenenpreis */
  child?: number;
  /** fehlt: Kinderpreis */
  infant?: number;
  /** Preis pro Einheit (mode "unit") */
  unit?: number;
  /** Personen pro Einheit; mit multiply werden so viele Einheiten gebucht wie nötig */
  capacity?: number;
  multiply?: boolean;
}

export interface FlightLeg {
  dir: "out" | "back";
  from: string;
  to: string;
  /** ISO lokal, z. B. 2027-07-18T06:10 */
  dep: string;
  arr: string;
  carrier?: string;
  stops?: number;
}

export interface Option {
  id: string;
  label: string;
  detail?: string;
  price: Price;
  /** Richtwert statt echtem Angebot */
  estimate?: boolean;
  /** Herkunft und Stand des Preises */
  source?: { name: string; at?: string; url?: string };
  legs?: FlightLeg[];
  stay?: { stars?: number; rating?: number; nights?: number; facts?: string[] };
}

export interface Payment {
  amount: number;
  at?: string;
  by?: string;
  note?: string;
}

export interface Item {
  id: string;
  cat: CatKey;
  name: string;
  note?: string;
  icon?: string;
  status: Status;
  /** fehlt: alle Reisenden */
  participants?: string[];
  options: Option[];
  /** gewählte Option; fehlt: die günstigste */
  chosen?: string;
  /** eigener Gruppenrabatt statt dem der Kategorie */
  tier?: Tier;
  booking?: { ref?: string; provider?: string; cancelUntil?: string };
  /** Unterkunft: Zeitraum (Anreise, Abreise). Dann zählt jede Nacht nur für die Anwesenden. */
  from?: string;
  to?: string;
  /** Flug: Anreise zum Abflughafen automatisch einrechnen (Standard: ja) */
  access?: boolean;
  payments?: Payment[];
}

export interface Household {
  /** Postleitzahl des Wohnorts */
  plz?: string;
  /** aufgelöster Wohnort, wird beim Eintippen der PLZ gesetzt */
  geo?: { lat: number; lon: number; ort: string };
  /** Anreise zum Flughafen */
  mode?: "car" | "train" | "with";
  cars?: number;
  /** fährt mit diesem Haushalt mit */
  link?: string;
  /** eigene Anwesenheit statt aus dem Flug: erste Nacht, Abreisetag */
  arrive?: string;
  depart?: string;
}

export interface Airport {
  code: string;
  name: string;
  /** Bahnticket pro Person, hin und zurück */
  pp: number;
  /** Fahrzeit in Stunden, wenn keine PLZ bekannt */
  h: number;
  /** Parken pro Tag */
  park: number;
  lat: number;
  lon: number;
}

export interface Settings {
  /** ab diesem Alter Erwachsener */
  adultAge: number;
  /** ab diesem Alter Kind, darunter Kleinkind */
  childAge: number;
  /** Einheiten Fremdwährung pro 1 € */
  rates: Record<string, number>;
  /** Autokosten pro km */
  kmCost?: number;
  /** eigene Abflughäfen statt der Standardliste */
  airports?: Airport[];
}

export interface Trip {
  id: string;
  name: string;
  place: string;
  country: string;
  kicker?: string;
  from?: string;
  to?: string;
  home?: string;
  travelers: Traveler[];
  households?: Record<string, Household>;
  items: Item[];
  /** Einfacher Modus: ein Betrag je Bereich, gleich auf alle Aktiven verteilt */
  simple?: Partial<Record<CatKey, number>>;
  /** Bereiche, die detailliert (mit Posten) gerechnet werden. Fehlt: detailliert, sobald es Posten gibt. */
  detail?: Partial<Record<CatKey, boolean>>;
  tiers: Partial<Record<CatKey, Tier[]>>;
  settings: Settings;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_SETTINGS: Settings = { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 };

export const hhKey = (t: Traveler) => t.household.trim() || "Ohne Haushalt";

export const isActive = (t: Traveler) => t.active !== false;

/** Wird dieser Bereich mit einzelnen Posten gerechnet? */
export const isDetailed = (trip: Trip, cat: CatKey) => trip.detail?.[cat] ?? trip.items.some(i => i.cat === cat);
