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
  /** Alter zum Reisezeitpunkt; fehlt: gilt als erwachsen */
  age?: number | null;
  /** Familie; bei Personen aus Gruppen der Nachname */
  household: string;
  color?: string;
  /** false: für diese Reise nicht dabei (zählt nirgends mit) */
  active?: boolean;
  /** gespeicherte Person, aus der dieser Reisende stammt */
  personId?: string;
  /** Altersklasse, wenn kein Alter bekannt ist (z. B. bei Platzhaltern) */
  kind?: "adult" | "child" | "infant";
  /** Platzhalter mit Tiernamen („Reh Kind 1“), nur in dieser Reise, nicht in Gruppen gespeichert */
  placeholder?: boolean;
  /** Staatsangehörigkeit (ISO-2, z. B. „DE“) für die Einreise-Hinweise; fehlt: deutsch angenommen. Nicht aus den Ausweisdaten. */
  nat?: string;
  /** Kasse: Kind wird von diesem Erwachsenen (ID) bezahlt, wenn die Eltern getrennte Kassen haben; fehlt: von allen Erwachsenen der Familie */
  payer?: string;
}

/** Gespeicherte Person (im Konto), unabhängig von Reisen */
export interface Person {
  id: string;
  first: string;
  last: string;
  /** Alter, falls kein Geburtsdatum bekannt ist */
  age?: number | null;
  /** Geburtsdatum JJJJ-MM-TT: das Alter zum Reisebeginn rechnet die App selbst */
  birth?: string;
  /** ungefährer Wohnort für Anfahrt und Flughafensuche (deutsche PLZ) */
  home?: { plz: string; ort: string; lat: number; lon: number };
}

/**
 * Buchungsdaten einer Person (optional). Liegen nur im Konto (travelDocs/{uid}), nie im Browser, nie in Reisen,
 * nie bei KI, Such-Dienst oder Fehlermeldungen.
 */
export interface TravelDoc {
  /** Vornamen und Nachname wie im Ausweis, falls abweichend */
  first?: string;
  last?: string;
  gender?: "f" | "m" | "x";
  /** Staatsangehörigkeit, z. B. „deutsch“ */
  nationality?: string;
  idNo?: string;
  idExpiry?: string;
  passNo?: string;
  passExpiry?: string;
  /** Ausstellungsland des Reisepasses */
  passCountry?: string;
}

/** Gespeicherte Gruppe, z. B. Familie oder Kegelclub. Eine Person kann in mehreren Gruppen sein. */
export interface Group {
  id: string;
  name: string;
  memberIds: string[];
  /** Vorlieben der Gruppe: überschreiben einzelne Punkte der eigenen Vorlieben */
  prefs?: Prefs;
}

export type TravelStyle = "beach" | "city" | "nature" | "culture" | "party" | "wellness" | "ski" | "roadtrip";
export const STYLES: TravelStyle[] = ["beach", "city", "nature", "culture", "party", "wellness", "ski", "roadtrip"];

/**
 * Vorlieben für Suchen und KI (im Konto, je Gruppe überschreibbar). Alles optional: fehlt = keine Vorgabe.
 * Belegen Such-Formulare und KI nur vor; gesperrte Länder filtern (kein Ziel, kein Umstieg).
 */
export interface Prefs {
  /** gesperrte Länder (ISO, z. B. „EG“): nicht als Ziel, nicht zum Umsteigen */
  avoid?: string[];
  /** Flüge */
  airports?: string[];
  /** Postleitzahl des Wohnorts (nur eigene Vorlieben, im Konto): belegt die Flugsuche vor */
  plz?: string;
  maxStops?: number;
  bags?: boolean;
  /** Kinder sitzen im Flugzeug neben den Eltern (fehlt: ja); bei manchen Billigfliegern kostet das die Platzwahl */
  seatsTogether?: boolean;
  /** längste Flugzeit je Richtung in Stunden */
  maxHours?: number;
  /** Anfahrt zum Flughafen */
  access?: "car" | "train";
  /** Unterkunft */
  stayType?: "whole" | "hotel" | "all";
  minStars?: number;
  board?: Board;
  /** Reisestil */
  styles?: TravelStyle[];
  budget?: "low" | "mid" | "high";
  /** was die KI sonst wissen soll (ohne Namen) */
  note?: string;
  /** Reisezeiten: Bundesland für Schulferien, bevorzugte Monate (1–12), übliche Nächte */
  holidays?: string;
  months?: number[];
  nightsMin?: number;
  nightsMax?: number;
}

export interface Directory {
  people: Person[];
  groups: Group[];
  /** die gespeicherte Person, die man selbst ist (Wohnort für die KI auf der Startseite) */
  me?: string;
  /** eigene Vorlieben */
  prefs?: Prefs;
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
  /** Hinflug, weiterer Flug einer Rundreise, Rückflug */
  dir: "out" | "via" | "back";
  from: string;
  to: string;
  /** ISO lokal, z. B. 2027-07-18T06:10 */
  dep: string;
  arr: string;
  carrier?: string;
  stops?: number;
  /** Flugdauer in Minuten (aus der Suche); Abflug und Landung sind Ortszeiten verschiedener Zeitzonen */
  minutes?: number;
  /** Stadt am Ziel des Flugs (für Unterkünfte je Station einer Rundreise) */
  toCity?: string;
}

export interface Option {
  id: string;
  label: string;
  detail?: string;
  price: Price;
  /** Richtwert statt echtem Angebot */
  estimate?: boolean;
  /** Herkunft und Stand des Preises */
  /** sponsored: Link mit Partnerkennung (in der App als Partner-Link gekennzeichnet) */
  /** test: aus einem Testzugang übernommen, Preis nicht echt */
  source?: { name: string; at?: string; url?: string; sponsored?: boolean; test?: boolean };
  legs?: FlightLeg[];
  stay?: { stars?: number; rating?: number; nights?: number; facts?: string[]; board?: Board; image?: string };
  /** Foto vom Anbieter (nur https), z. B. einer Tour */
  image?: string;
  /** Lage (Unterkunft, Veranstaltungsort): Koordinaten vom Anbieter und Suchtext für Google Maps */
  loc?: { lat?: number; lon?: number; q?: string };
  /** Unterkunft aus der Suche: Anfrage, mit der sie gefunden wurde (für die Reisebeobachtung) */
  query?: { place: string; country?: string; checkin: string; checkout: string; adults: number; childAges: number[]; rooms: number };
  /** große Gruppe aufgeteilt: Flug in Buchungen zu höchstens so vielen Personen, Unterkunft auf so viele Unterkünfte */
  split?: number;
  /** Nebenkosten (Kurtaxe, Endreinigung, Gepäck …): enthalten, vor Ort oder zusätzlich zu zahlen */
  extras?: Extra[];
  /** Kaution: wird nur geblockt, zählt nie zu den Kosten */
  deposit?: Deposit;
  /** automatisch geschätzte Nebenkosten (z. B. auto:citytax:rome), die weggeklickt wurden */
  autoOff?: string[];
  /** automatische Schätzungen, die erst auf Wunsch zählen (Mietwagen: Vollschutz, Zusatzfahrer), eingeschaltet */
  autoOn?: string[];
  /** Flug aus der Suche: im Preis enthaltenes Gepäck (gesamt für alle); fehlt: nicht angegeben */
  baggage?: { personal: number; cabin: number; checked: number };
  /** Hinweise am Flug: früh einchecken (Familie), Kartenaufschlag möglich (Abflug außerhalb EU/EWR) */
  hints?: ("checkin" | "payfee")[];
}

export type ExtraKind = "citytax" | "tax" | "cleaning" | "resort" | "bag" | "seat" | "toll" | "vignette" | "visa" | "tips" | "insurance" | "driver" | "young" | "cover" | "other";
/** pro Person, pro Person und Nacht, pro Nacht, pro Tag, pro Person und Tag, einmal je Buchung, Prozent vom Preis */
export type ExtraBasis = "person" | "personNight" | "night" | "day" | "personDay" | "booking" | "percent";

export interface Extra {
  id: string;
  kind: ExtraKind;
  /** eigene Bezeichnung (sonst nach Art) */
  label?: string;
  amount: number;
  basis: ExtraBasis;
  /** im Preis enthalten (nur zur Info), vor Ort zu zahlen, bei der Buchung zusätzlich */
  pay: "included" | "onsite" | "extra";
  /** geschätzt („ca.“), sonst laut Anbieter bzw. selbst eingetragen */
  est?: boolean;
  /** Kinder bis einschließlich diesem Alter frei (pro Person) */
  freeUpTo?: number;
  /** höchstens so viele Nächte bzw. Tage */
  max?: number;
  /** Quelle, z. B. „Stadt Split, Stand 2026“ oder „liteAPI“ */
  source?: string;
  /** Land (Maut, Vignette): Name in der Sprache der App */
  cc?: string;
  /** automatisch vorgeschlagen und weggeklickt */
  off?: boolean;
}

export interface Deposit {
  amount: number;
  /** wofür, z. B. „Mietwagen“, „Ferienwohnung“ */
  for?: string;
  /** nur Kreditkarte (keine Debitkarte), Kredit- oder Debitkarte, bar, Überweisung */
  how?: "credit" | "card" | "cash" | "transfer";
  note?: string;
  est?: boolean;
}

export interface Payment {
  amount: number;
  at?: string;
  /** wer bezahlt hat: Familie (Haushalt) */
  by?: string;
  note?: string;
}

/** Ausgabe unterwegs (Kasse): Restaurant, Taxi, Eintritt … ausgelegt von einer Familie, geteilt auf die Familien in for */
export interface Expense {
  id: string;
  text: string;
  amount: number;
  /** fehlt: EUR */
  currency?: string;
  /** JJJJ-MM-TT */
  date?: string;
  /** ausgelegt von dieser Kasse (Familie mit gemeinsamer Kasse: ihr Name, sonst „p:“ + Personen-ID) */
  by: string;
  /** für diese Kassen bzw. Familien (nach Personen geteilt); fehlt: alle */
  for?: string[];
  cat?: CatKey;
  /** geteilte Reise: eingereicht von diesem Konto (ID, Name); ohne: zählt sofort */
  uid?: string;
  who?: string;
  /** bestätigt (✅) von Konto-ID → Name */
  ok?: Record<string, string>;
  /** Einspruch (❌) von Konto-ID → Name und Grund */
  no?: Record<string, { name: string; why?: string }>;
  /** Entscheidung des Admins (Besitzer der Reise) */
  state?: "approved" | "rejected";
}
/** Ausgleich: Kasse from hat Kasse to diesen Betrag gegeben */
export interface Transfer { id: string; from: string; to: string; amount: number; at?: string }

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
  /** automatisch gerechnet (Verpflegung je Familie), wird bei Änderungen neu gesetzt */
  auto?: "food";
  /** automatische Verpflegung: Familien des Postens („Klein“, „Klein|Hase“, „*“ für alle) */
  hh?: string;
  /** Flug: fliegt mit im Flug dieses Postens (gleicher Flug, gleicher Preis pro Person, wie im Artefakt „Wie Klein“) */
  follow?: string;
  payments?: Payment[];
  /** Anreise ohne Flug (Auto, Bahn, Bus): Teilnehmer gelten als angereist wie mit einem Flug */
  arrival?: boolean;
  /** von der KI: vorgeschlagen (echtes Angebot), erstellt (Schätzung) oder angepasst (ersetzt einen Posten) */
  ai?: AiMark;
  /** Tagesplan: an diesem Tag (JJJJ-MM-TT, optional mit Uhrzeit JJJJ-MM-TTTHH:MM) */
  day?: string;
  /** aus einem Hinweis (Einreise & Tipps) übernommen, z. B. „galapagos“; „rental“ = Mietwagen, „road:car“ = eigenes Auto */
  hint?: string;
}

/** eigener Eintrag im Tagesplan („Abendessen“, „Ruhetag“, „Zug nach Dubrovnik“) */
export type NoteKind = "see" | "food" | "fun" | "rest" | "move" | "note";
export interface DayNote {
  id: string;
  text: string;
  kind?: NoteKind;
  /** HH:MM */
  time?: string;
  /** Ziel bei „move“ (Ort für die Route) */
  to?: string;
}
export interface DayPlan { title?: string; notes?: DayNote[] }

export interface AiMark { at: string; kind: "suggested" | "created" | "changed" }

export type AccessMode = "car" | "drop" | "taxi" | "train" | "bus" | "with";
export const ACCESS_MODES: AccessMode[] = ["car", "drop", "taxi", "train", "bus", "with"];

export interface Household {
  /** Postleitzahl des Wohnorts */
  plz?: string;
  /** aufgelöster Wohnort, wird beim Eintippen der PLZ gesetzt */
  geo?: { lat: number; lon: number; ort: string };
  /** Anreise zum Flughafen: selbst fahren und parken, bringen und abholen lassen, Fahrdienst/Taxi, Bahn, Gruppenbus, Fahrgemeinschaft */
  mode?: AccessMode;
  cars?: number;
  /** Fahrgemeinschaft: fährt mit diesem Haushalt mit (Kosten nach Personen geteilt) */
  link?: string;
  /** Fahrdienst/Taxi: Preis je Fahrt für alle Fahrzeuge (leer = Richtwert) */
  ride?: number;
  /** Kasse: gemeinsam (eine Kasse für die Familie) oder jeder Erwachsene zahlt selbst; fehlt: bis 2 Erwachsene gemeinsam */
  kasse?: "joint" | "each";
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

/** Anlass mit fester Zeit (Spiel, Konzert): daraus werden Reisevorschläge; Ort der Reise ist place/country */
export interface TripEvent {
  name: string;
  /** Stadion, Halle, Adresse (für Hinweise und Karte) */
  venue?: string;
  /** Beginn, lokal, z. B. 2027-05-15T18:00 */
  start: string;
  /** Dauer in Stunden (Standard 3) */
  hours?: number;
  /** Veranstaltungsort, falls bekannt (für Unterkünfte in der Nähe) */
  lat?: number;
  lon?: number;
  /** Seite des Anbieters (Tickets) */
  url?: string;
}

/** Zuschuss zur Reise (Kasse, Sponsor, Familie): wird von den Kosten der Begünstigten abgezogen */
export interface Fund {
  id: string;
  /** von wem, z. B. „Mannschaftskasse“, „Oma & Opa“ */
  name: string;
  /** Betrag in Euro */
  amount: number;
  /** für wen (Reisende); fehlt: alle, die dabei sind */
  for?: string[];
  /** nur für diese Kosten (z. B. nur den Bus); fehlt: alle Kosten */
  cat?: CatKey;
  /** gleich je Person (Standard) oder nach Anteil an den Kosten */
  split?: "equal" | "share";
  /** Geld ist schon da (sonst nur zugesagt) */
  received?: boolean;
}

/** öffentliche Aktionsseite zum Mitfinanzieren (Zuschüsse Stufe 2), siehe campaign.ts */
export interface Campaign {
  /** zufällige Kennung der öffentlichen Seite */
  id: string;
  /** Konto, das veröffentlicht hat (nur dieses darf die Seite ändern) */
  owner?: string;
  title: string;
  text?: string;
  /** Ziel in Euro; fehlt: Reisekosten */
  goal?: number;
  holder: string;
  iban: string;
  /** PayPal.me-Name (ohne Adresse) */
  paypal?: string;
  /** zuletzt veröffentlicht (ISO) */
  at?: string;
}

export interface Trip {
  id: string;
  name: string;
  /** Name wird aus Ziel und Zeitraum gebildet, bis man selbst einen vergibt */
  autoName?: boolean;
  place: string;
  country: string;
  kicker?: string;
  from?: string;
  to?: string;
  home?: string;
  event?: TripEvent;
  travelers: Traveler[];
  households?: Record<string, Household>;
  /** Gruppenbus zum Flughafen für alle Familien mit Anreise „Gruppenbus“: Abfahrt beim Wohnort dieser Familie, Preis gesamt (leer = Richtwert) */
  bus?: { from?: string; price?: number };
  items: Item[];
  /** Einfacher Modus: ein Betrag je Bereich, gleich auf alle Aktiven verteilt */
  simple?: Partial<Record<CatKey, number>>;
  /** Einfacher Modus: einzelne Einträge mit Text, Betrag und wer dabei ist (zusätzlich zum Betrag für alle) */
  lines?: SimpleLine[];
  /** Zuschüsse: Mannschaftskasse, Oma und Opa, Sponsor … senken den Eigenanteil */
  funds?: Fund[];
  /** Kasse: Ausgaben unterwegs und Ausgleichszahlungen zwischen Familien */
  expenses?: Expense[];
  transfers?: Transfer[];
  /** Tagesplan: je Tag (JJJJ-MM-TT) Überschrift und eigene Einträge; Flüge, Unterkünfte und Erlebnisse kommen automatisch dazu */
  days?: Record<string, DayPlan>;
  /** öffentliche Aktionsseite zum Mitfinanzieren (Zuschüsse Stufe 2), nur mit Einwilligung zu Name und IBAN */
  campaign?: Campaign;
  /** Bereiche, die detailliert (mit Posten) gerechnet werden. Fehlt: detailliert, sobald es Posten gibt. */
  detail?: Partial<Record<CatKey, boolean>>;
  tiers: Partial<Record<CatKey, Tier[]>>;
  settings: Settings;
  /** Verpflegung wie im Artefakt: Essensstil für alle oder je Familie, Kinder und Babys in Prozent */
  food?: FoodCfg;
  /** Reisebeobachtung: letzter Preisvergleich der Posten */
  watch?: TripWatch;
  /** vom KI-Assistenten vorgeschlagen (Kennzeichnung in der Übersicht) */
  ai?: { at: string };
  /** Wichtiges: erledigte Punkte (important.ts), bei Punkten für Personen je Person */
  done?: Record<string, { sig: string; ids?: string[] }>;
}

/** Ergebnis der Nachsuche für einen Posten, Beträge für den ganzen Posten */
export interface WatchHit {
  /** Preis vor der Prüfung */
  was: number;
  /** dasselbe Angebot heute, falls wiedergefunden (steht dann auch im Angebot) */
  now?: number;
  /** günstigeres Angebot für dieselbe Reise */
  best?: number;
  bestOpt?: Option;
  /** nicht prüfbar oder Suche fehlgeschlagen */
  err?: string;
  /** nach einem günstigeren Angebot gesucht, keins gefunden */
  noBetter?: boolean;
}
export interface TripWatch { at: string; items: Record<string, WatchHit> }

/** Selbstversorgung, gemischt, auswärts, Genießer, Halbpension, All-inclusive */
/** Verpflegung in der Unterkunft: ohne, Frühstück, Halbpension, Vollpension, All-inclusive */
export type Board = "self" | "breakfast" | "half" | "full" | "all";
export const BOARDS: Board[] = ["self", "breakfast", "half", "full", "all"];

/** Eintrag im einfachen Modus, z. B. „Stadionführung 50 € · Daniel, Henning“; gleich auf die Beteiligten verteilt */
export interface SimpleLine {
  id: string;
  cat: CatKey;
  label: string;
  amount: number;
  /** fehlt: alle, die dabei sind */
  who?: string[];
}

export type FoodStyle = "self" | "mix" | "out" | "treat" | "hb" | "ai";
export interface FoodCfg { on?: boolean; style?: FoodStyle; hh?: Record<string, FoodStyle>; child?: number; infant?: number }

export const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_SETTINGS: Settings = { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 };

export const hhKey = (t: Traveler) => t.household.trim() || "Ohne Haushalt";

export const isActive = (t: Traveler) => t.active !== false;

/** Wird dieser Bereich mit einzelnen Posten gerechnet? */
/** leer angelegtes Angebot (ohne Namen, Preis und Herkunft), z. B. von „+ Unterkunft“ */
export const blankOption = (o: Option) => !o.label && !o.price.unit && !o.price.adult && !o.price.child && !o.legs?.length && !o.source;

/** Angebot aus einer Suche dazu; leere Angebote fliegen dabei raus (tauchten sonst als „Angebot 2“ im Vergleich auf) */
export function addOffer(item: Item, opt: Option) {
  item.options = [...item.options.filter(o => !blankOption(o)), opt];
  if (item.chosen && !item.options.some(o => o.id === item.chosen)) item.chosen = undefined;
}

export const isDetailed = (trip: Trip, cat: CatKey) => trip.detail?.[cat] ?? trip.items.some(i => i.cat === cat);
