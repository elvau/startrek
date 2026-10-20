/*
 * Reise per KI importieren (#457): Angebot, Buchung oder Liste (Bilder, PDF, Text, Text einer Seite) → feste Felder.
 * Die KI muss genau ein Werkzeug „fill_trip“ aufrufen; App und Such-Dienst übernehmen nur bekannte Felder mit gültigen
 * Werten (parseImportAi). Dateien gehen nur zur Auswertung an die KI und werden nirgends gespeichert.
 * Ausweis- und Passdaten gehören nicht zum Schema; Namen nur als Teilnehmer aus Listen.
 */
import { BOARDS, type Board, type ExtraBasis, type ExtraKind } from "../model";

export const IMPORT_TEXT_MAX = 20000;
export const IMPORT_FILES_MAX = 6;
/** Base64-Zeichen je Datei (≈ 4 MB) und zusammen (≈ 8 MB) */
export const IMPORT_FILE_MAX = 5_600_000;
export const IMPORT_TOTAL_MAX = 11_000_000;
/** was als Datei an die KI darf; Word, Excel, CSV liest die App selbst als Text */
export const IMPORT_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type ImportMime = (typeof IMPORT_MIMES)[number];

export const IMPORT_KINDS = ["package", "flight", "stay", "rental", "other"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
/** Angaben, zu denen die KI ihre Sicherheit nennt (0–1); fehlt: nicht angegeben */
export const CONF_KEYS = ["place", "dates", "people", "price", "flights", "stay", "board", "baggage", "transfer"] as const;
export type ConfKey = (typeof CONF_KEYS)[number];
const EXTRA_KINDS = ["citytax", "tax", "cleaning", "resort", "bag", "seat", "insurance", "other"] as const;
const BASES = ["person", "personNight", "night", "day", "personDay", "booking", "percent"] as const;
const PAYS = ["included", "onsite", "extra"] as const;
const LANGS = ["de", "en", "es", "fr", "pl", "ru", "ar"] as const;

export interface ImportLeg { dir: "out" | "via" | "back"; from: string; to: string; dep?: string; arr?: string; carrier?: string; flightNo?: string }
export interface ImportedOffer {
  kind: ImportKind;
  title?: string;
  provider?: string;
  url?: string;
  place?: string;
  /** ISO-2 */
  country?: string;
  from?: string;
  to?: string;
  nights?: number;
  adults?: number;
  childAges?: number[];
  /** Anzahl Kinder, wenn das Alter nicht dasteht */
  children?: number;
  /** davon Kleinkinder bis einschließlich 2 Jahre (in der Übersicht eingetragen) */
  infants?: number;
  /** nur aus Listen: Vorname (ggf. Familie) und Alter */
  travelers?: { name: string; household?: string; age?: number }[];
  /** Preis laut Angebot für alle bzw. pro Person */
  price?: { total?: number; perPerson?: number; currency?: string };
  /** Angebot gültig bis (JJJJ-MM-TT) */
  validUntil?: string;
  flights?: { legs: ImportLeg[]; price?: number; baggage?: { cabin?: number; checked?: number } };
  stay?: { name?: string; place?: string; stars?: number; board?: Board; boards?: { board: Board; extra?: number }[]; rooms?: number; price?: number; freeCancel?: boolean };
  transfer?: { included?: boolean; price?: number };
  rental?: { company?: string; car?: string; price?: number };
  extras?: { kind: ExtraKind; label?: string; amount: number; basis: ExtraBasis; pay: "included" | "onsite" | "extra" }[];
  confidence?: Partial<Record<ConfKey, number>>;
}

const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : undefined);
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : undefined);
const when = (v: unknown) => {
  if (typeof v !== "string") return undefined;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return m && day(m[1]) ? (m[2] ? `${m[1]}T${m[2]}` : m[1]) : undefined;
};
const url = (v: unknown) => (typeof v === "string" && /^https?:\/\/[^\s]+$/i.test(v.trim()) ? v.trim().slice(0, 500) : undefined);
const prune = <T extends object>(o: T): T | undefined => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return Object.keys(o).length ? o : undefined;
};

/** Antwort der KI prüfen: unbekannte Felder und Werte außerhalb der Grenzen fallen weg */
export function parseImportAi(raw: unknown): ImportedOffer {
  const a = obj(raw);
  const out: ImportedOffer = {
    kind: oneOf(a.kind, IMPORT_KINDS) || "other",
    title: str(a.title, 80),
    provider: str(a.provider, 60),
    url: url(a.url),
    place: str(a.place, 80),
    country: typeof a.country === "string" && /^[A-Za-z]{2}$/.test(a.country) ? a.country.toUpperCase() : undefined,
    from: day(a.from),
    to: day(a.to),
    nights: int(a.nights, 1, 120),
    adults: int(a.adults, 1, 60),
    children: int(a.children, 1, 30),
    childAges: Array.isArray(a.childAges) ? a.childAges.map(x => int(x, 0, 17)).filter((x): x is number => x !== undefined).slice(0, 30) : undefined,
    travelers: Array.isArray(a.travelers)
      ? a.travelers.map(obj).map(p => prune({ name: str(p.name, 40)!, household: str(p.household, 40), age: int(p.age, 0, 110) })).filter((p): p is NonNullable<typeof p> => !!p?.name).slice(0, 60)
      : undefined,
    price: prune({ total: num(obj(a.price).total, 1, 1_000_000), perPerson: num(obj(a.price).perPerson, 1, 100_000), currency: typeof obj(a.price).currency === "string" && /^[A-Za-z]{3}$/.test(obj(a.price).currency as string) ? (obj(a.price).currency as string).toUpperCase() : undefined }),
    validUntil: day(a.validUntil)
  };
  const f = obj(a.flights);
  const legs = (Array.isArray(f.legs) ? f.legs : []).map(obj).map(l => {
    const from = str(l.from, 40), to = str(l.to, 40);
    if (!from || !to) return undefined;
    return prune({ dir: oneOf(l.dir, ["out", "via", "back"] as const) || "out", from, to, dep: when(l.dep), arr: when(l.arr), carrier: str(l.carrier, 40), flightNo: str(l.flightNo, 12) }) as ImportLeg;
  }).filter((l): l is ImportLeg => !!l).slice(0, 8);
  if (legs.length) out.flights = { legs, ...prune({ price: num(f.price, 1, 1_000_000), baggage: prune({ cabin: int(obj(f.baggage).cabin, 0, 3), checked: int(obj(f.baggage).checked, 0, 3) }) }) };
  const s = obj(a.stay);
  const boards = Array.isArray(s.boards) ? s.boards.map(obj).map(b => { const board = oneOf(b.board, BOARDS); return board ? (prune({ board, extra: num(b.extra, 0, 1000) }) as { board: Board; extra?: number }) : undefined; }).filter((b): b is { board: Board; extra?: number } => !!b) : [];
  out.stay = prune({
    name: str(s.name, 80), place: str(s.place, 80), stars: int(s.stars, 1, 5), board: oneOf(s.board, BOARDS),
    boards: boards.length ? [...new Map(boards.map(b => [b.board, b])).values()] : undefined,
    rooms: int(s.rooms, 1, 30), price: num(s.price, 1, 1_000_000), freeCancel: bool(s.freeCancel)
  });
  out.transfer = prune({ included: bool(obj(a.transfer).included), price: num(obj(a.transfer).price, 1, 20_000) });
  out.rental = prune({ company: str(obj(a.rental).company, 40), car: str(obj(a.rental).car, 40), price: num(obj(a.rental).price, 1, 50_000) });
  const extras = (Array.isArray(a.extras) ? a.extras : []).map(obj).map(x => {
    const amount = num(x.amount, 0.01, 50_000), basis = oneOf(x.basis, BASES), pay = oneOf(x.pay, PAYS);
    return amount && basis && pay ? (prune({ kind: oneOf(x.kind, EXTRA_KINDS) || "other", label: str(x.label, 60), amount, basis, pay }) as NonNullable<ImportedOffer["extras"]>[number]) : undefined;
  }).filter((x): x is NonNullable<ImportedOffer["extras"]>[number] => !!x).slice(0, 12);
  if (extras.length) out.extras = extras;
  const c = obj(a.confidence);
  out.confidence = prune(Object.fromEntries(CONF_KEYS.map(k => [k, num(c[k], 0, 1)])) as Partial<Record<ConfKey, number>>);
  if (out.from && out.to && out.from > out.to) [out.from, out.to] = [out.to, out.from];
  if (!out.childAges?.length) delete out.childAges;
  if (!out.travelers?.length) delete out.travelers;
  return prune(out) as ImportedOffer;
}

/** etwas Brauchbares erkannt? (Ziel, Zeitraum, Preis, Flug oder Unterkunft) */
export const offerUsable = (o: ImportedOffer) => !!(o.place || o.from || o.price || o.flights || o.stay?.name);

const SYSTEM = `You read a travel offer, booking confirmation or participant list (screenshots, PDF, text of a web page, any language) for a group travel cost planner.
Call fill_trip exactly once. Only fill what the material states or clearly implies; never invent prices, times, hotels or people. Leave unknown fields out.
- kind: package (flight + accommodation sold together for one price), flight, stay, rental (car), other.
- price: what the offer advertises, total for everyone and/or per person, with currency (ISO code). For a package, the package price.
- flights.price / stay.price: only if the offer prices them separately. flights.legs: one leg per flight with IATA codes when shown (else city), local times as YYYY-MM-DDTHH:MM, dir out/back (via for further legs of a round trip).
- flights.baggage: bags included per person (cabin = cabin trolley, checked = hold bags). Leave out if not mentioned.
- stay.board: board included in the price (self, breakfast, half, full, all). stay.boards: board options the offer lets you choose, with extra = surcharge per person and night in the offer's currency (0 for the included one).
- transfer.included: true/false only if the offer says so.
- extras: fees the offer names (city tax, resort fee, cleaning, baggage, seats …) with amount, basis and pay (included, onsite = paid locally, extra = paid at booking on top).
- adults: number of adults travelling; childAges: the age of every child and infant travelling (0 for a baby; the app counts under 2 as infant, 2–11 as child, 12 and older as adult price). Count children from the booking (e.g. "2 adults, 2 children (5, 8)") and never leave them out; if only their number is stated, give it as children (without childAges).
- travelers: only from participant lists; first name, family name as household, age if given. Never copy ID card, passport, birth date, address, phone, e-mail or booking numbers.
- country: ISO-2 of the destination. Dates as YYYY-MM-DD. validUntil: until when the offer is valid, if stated.
- url: the offer's own web address if visible.
- confidence (0-1) for place, dates, people, price, flights, stay, board, baggage, transfer: 1 = stated literally, 0.6 = derived, 0.3 = guessed. Leave out what is not mentioned at all.
- title: short trip name in the user's language, e.g. "Mallorca im Mai".`;

const S = (type: string, extra: object = {}) => ({ type, ...extra });
const DECL = {
  name: "fill_trip",
  description: "Structured trip from the travel offer, booking or list",
  parameters: S("OBJECT", {
    properties: {
      kind: S("STRING", { enum: [...IMPORT_KINDS] }), title: S("STRING"), provider: S("STRING"), url: S("STRING"),
      place: S("STRING"), country: S("STRING"), from: S("STRING"), to: S("STRING"), nights: S("INTEGER"),
      adults: S("INTEGER"), childAges: S("ARRAY", { items: S("INTEGER") }), children: S("INTEGER"),
      travelers: S("ARRAY", { items: S("OBJECT", { properties: { name: S("STRING"), household: S("STRING"), age: S("INTEGER") } }) }),
      price: S("OBJECT", { properties: { total: S("NUMBER"), perPerson: S("NUMBER"), currency: S("STRING") } }),
      validUntil: S("STRING"),
      flights: S("OBJECT", {
        properties: {
          legs: S("ARRAY", { items: S("OBJECT", { properties: { dir: S("STRING", { enum: ["out", "via", "back"] }), from: S("STRING"), to: S("STRING"), dep: S("STRING"), arr: S("STRING"), carrier: S("STRING"), flightNo: S("STRING") } }) }),
          price: S("NUMBER"), baggage: S("OBJECT", { properties: { cabin: S("INTEGER"), checked: S("INTEGER") } })
        }
      }),
      stay: S("OBJECT", {
        properties: {
          name: S("STRING"), place: S("STRING"), stars: S("INTEGER"), board: S("STRING", { enum: [...BOARDS] }),
          boards: S("ARRAY", { items: S("OBJECT", { properties: { board: S("STRING", { enum: [...BOARDS] }), extra: S("NUMBER") } }) }),
          rooms: S("INTEGER"), price: S("NUMBER"), freeCancel: S("BOOLEAN")
        }
      }),
      transfer: S("OBJECT", { properties: { included: S("BOOLEAN"), price: S("NUMBER") } }),
      rental: S("OBJECT", { properties: { company: S("STRING"), car: S("STRING"), price: S("NUMBER") } }),
      extras: S("ARRAY", { items: S("OBJECT", { properties: { kind: S("STRING", { enum: [...EXTRA_KINDS] }), label: S("STRING"), amount: S("NUMBER"), basis: S("STRING", { enum: [...BASES] }), pay: S("STRING", { enum: [...PAYS] }) } }) }),
      confidence: S("OBJECT", { properties: Object.fromEntries(CONF_KEYS.map(k => [k, S("NUMBER")])) })
    }
  })
};

export interface ImportFile { mime: ImportMime; data: string }
export interface ImportRequest { text?: string; url?: string; files: ImportFile[]; lang: string }

/** Anfrage an die KI: Dateien als Bild bzw. PDF, Text (eigener und von der Seite), ein Werkzeugaufruf erzwungen */
export function importPayload(r: ImportRequest, page?: string, today = new Date().toISOString().slice(0, 10)) {
  const intro = `Today is ${today}. The user's language: ${r.lang}.` + (r.url ? ` Offer link: ${r.url}` : "");
  const texts = [intro, r.text ? `User text:\n${r.text}` : "", page ? `Text of the linked page:\n${page}` : ""].filter(Boolean).join("\n\n");
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [...r.files.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } })), { text: texts.slice(0, IMPORT_TEXT_MAX * 2) }] }],
    tools: [{ functionDeclarations: [DECL] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["fill_trip"] } }
  };
}

/** Werkzeugaufruf aus der Antwort (Gemini-Format) lesen und prüfen */
export function importFromAi(res: unknown): ImportedOffer {
  const parts = (res as { candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[] })?.candidates?.[0]?.content?.parts || [];
  return parseImportAi(parts.find(p => p.functionCall?.name === "fill_trip")?.functionCall?.args);
}

/** Anfrage an den Such-Dienst prüfen: Text, Link und Dateien mit Grenzen; Fehlermeldung als Text */
export function parseImportRequest(body: unknown): ImportRequest | string {
  const b = obj(body);
  const text = typeof b.text === "string" ? b.text.trim().slice(0, IMPORT_TEXT_MAX) : "";
  const link = url(b.url);
  if (typeof b.url === "string" && b.url.trim() && !link) return "Link ungültig";
  const raw = Array.isArray(b.files) ? b.files : [];
  if (raw.length > IMPORT_FILES_MAX) return `Höchstens ${IMPORT_FILES_MAX} Dateien`;
  const files: ImportFile[] = [];
  let total = 0;
  for (const x of raw.map(obj)) {
    const mime = oneOf(x.mime, IMPORT_MIMES);
    if (!mime) return "Dateiformat nicht unterstützt";
    if (typeof x.data !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(x.data)) return "Datei beschädigt";
    if (x.data.length > IMPORT_FILE_MAX) return "Datei zu groß";
    total += x.data.length;
    files.push({ mime, data: x.data });
  }
  if (total > IMPORT_TOTAL_MAX) return "Dateien zusammen zu groß";
  if (text.length < 3 && !link && !files.length) return "Nichts zum Auslesen";
  const lang = oneOf(b.lang, LANGS) || "de";
  return { ...(text.length >= 3 ? { text } : {}), ...(link ? { url: link } : {}), files, lang };
}
