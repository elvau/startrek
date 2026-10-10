/*
 * Konto einrichten mit KI (#160): freier Text → feste Felder. Gemini bekommt nur den Text (ohne Namen, Geschlecht,
 * Staatsangehörigkeit, Geburtsdatum: die fragt die App selbst ab) und muss genau ein Werkzeug „fill_profile“ aufrufen.
 * Übernommen werden nur bekannte Felder mit gültigen Werten; App und Such-Dienst prüfen beide mit parseSetupAi.
 */
import { BOARDS, STYLES, type Board, type TravelStyle } from "../model";

export const SETUP_TEXT_MAX = 1500;

export const LICENSES = ["none", "lt1", "gt1", "gt2", "gt5"] as const;
export type LicenseBucket = (typeof LICENSES)[number];
export const FUELS = ["petrol", "diesel", "hybrid", "electric"] as const;
export type Fuel = (typeof FUELS)[number];
export const DIETS = ["veg", "vegan"] as const;
export const RAIL_DE = ["bc25", "bc50", "bc100", "dticket"] as const;
export const STATES = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"] as const;

/** was die KI vorschlagen darf; alles optional */
export interface SetupAi {
  adults?: number;
  childAges?: number[];
  license?: LicenseBucket;
  creditCard?: boolean;
  car?: { seats?: number; fuel?: Fuel };
  rail?: string[];
  styles?: TravelStyle[];
  budget?: "low" | "mid" | "high";
  stayType?: "whole" | "hotel" | "all";
  minStars?: number;
  board?: Board;
  airports?: string[];
  maxStops?: number;
  bags?: boolean;
  maxHours?: number;
  holidays?: string;
  months?: number[];
  nightsMin?: number;
  nightsMax?: number;
  pet?: boolean;
  stepFree?: boolean;
  diet?: "veg" | "vegan";
}

const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const list = <T>(v: unknown, pick: (x: unknown) => T | undefined, max: number): T[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map(pick).filter((x): x is T => x !== undefined))].slice(0, max);
  return out.length ? out : undefined;
};

/** Antwort der KI prüfen: unbekannte Felder und Werte außerhalb der Grenzen fallen weg */
export function parseSetupAi(raw: unknown): SetupAi {
  const a = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const car = a.car && typeof a.car === "object" ? (a.car as Record<string, unknown>) : {};
  const out: SetupAi = {
    adults: int(a.adults, 1, 20),
    childAges: Array.isArray(a.childAges) ? a.childAges.map(x => int(x, 0, 17)).filter((x): x is number => x !== undefined).slice(0, 10) : undefined,
    license: oneOf(a.license, LICENSES),
    creditCard: bool(a.creditCard),
    car: { seats: int(car.seats, 2, 9), fuel: oneOf(car.fuel, FUELS) },
    rail: list(a.rail, x => oneOf(x, RAIL_DE), 4),
    styles: list(a.styles, x => oneOf(x, STYLES), STYLES.length),
    budget: oneOf(a.budget, ["low", "mid", "high"] as const),
    stayType: oneOf(a.stayType, ["whole", "hotel", "all"] as const),
    minStars: int(a.minStars, 2, 5),
    board: oneOf(a.board, BOARDS),
    airports: list(a.airports, x => (typeof x === "string" && /^[A-Za-z]{3}$/.test(x.trim()) ? x.trim().toUpperCase() : undefined), 4),
    maxStops: int(a.maxStops, 0, 2),
    bags: bool(a.bags),
    maxHours: int(a.maxHours, 1, 48),
    holidays: oneOf(a.holidays, STATES),
    months: list(a.months, x => int(x, 1, 12), 12)?.sort((x, y) => x - y),
    nightsMin: int(a.nightsMin, 1, 60),
    nightsMax: int(a.nightsMax, 1, 60),
    pet: bool(a.pet),
    stepFree: bool(a.stepFree),
    diet: oneOf(a.diet, DIETS)
  };
  if (out.nightsMin && out.nightsMax && out.nightsMin > out.nightsMax) [out.nightsMin, out.nightsMax] = [out.nightsMax, out.nightsMin];
  if (!out.childAges?.length) delete out.childAges;
  if (!out.car?.seats && !out.car?.fuel) delete out.car;
  else for (const k of ["seats", "fuel"] as const) if (out.car![k] === undefined) delete out.car![k];
  for (const k of Object.keys(out) as (keyof SetupAi)[]) if (out[k] === undefined) delete out[k];
  return out;
}

const SYSTEM = `You fill in a travel profile for a group travel planner from what the user writes (any language).
Call fill_profile exactly once. Only set fields the text clearly states or strongly implies; leave everything else out.
Never guess. Do not include names, gender, nationality or birth dates.
- adults/childAges: the people who usually travel together, including the writer. Children are under 18.
- license: how long the writer has had a driving licence (none, lt1 = under 1 year, gt1, gt2, gt5 = over 5 years).
- rail: German rail discounts (bc25, bc50, bc100 = BahnCard, dticket = Deutschlandticket).
- airports: IATA codes of home airports (e.g. Düsseldorf = DUS, Köln/Bonn = CGN).
- holidays: German state code for school holidays (e.g. NRW = NW, Bayern = BY), only if a state is named or clear from a city.
- months: preferred travel months 1-12. "Sommerferien" alone is not a month list.
- stayType: whole = holiday home/apartment, hotel = hotel, all = both.
- board: self, breakfast, half, full, all (all inclusive).
- budget: low, mid, high.
- stepFree: needs step-free access (pushchair or wheelchair).`;

const S = (type: string, extra: object = {}) => ({ type, ...extra });
const DECL = {
  name: "fill_profile",
  description: "Structured travel profile from the user's text",
  parameters: S("OBJECT", {
    properties: {
      adults: S("INTEGER"), childAges: S("ARRAY", { items: S("INTEGER") }),
      license: S("STRING", { enum: [...LICENSES] }), creditCard: S("BOOLEAN"),
      car: S("OBJECT", { properties: { seats: S("INTEGER"), fuel: S("STRING", { enum: [...FUELS] }) } }),
      rail: S("ARRAY", { items: S("STRING", { enum: [...RAIL_DE] }) }),
      styles: S("ARRAY", { items: S("STRING", { enum: [...STYLES] }) }),
      budget: S("STRING", { enum: ["low", "mid", "high"] }), stayType: S("STRING", { enum: ["whole", "hotel", "all"] }),
      minStars: S("INTEGER"), board: S("STRING", { enum: [...BOARDS] }),
      airports: S("ARRAY", { items: S("STRING") }), maxStops: S("INTEGER"), bags: S("BOOLEAN"), maxHours: S("INTEGER"),
      holidays: S("STRING", { enum: [...STATES] }), months: S("ARRAY", { items: S("INTEGER") }),
      nightsMin: S("INTEGER"), nightsMax: S("INTEGER"),
      pet: S("BOOLEAN"), stepFree: S("BOOLEAN"), diet: S("STRING", { enum: [...DIETS] })
    }
  })
};

/** Anfrage an Gemini: nur der Text, ein Werkzeugaufruf erzwungen */
export function setupPayload(text: string) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: text.slice(0, SETUP_TEXT_MAX) }] }],
    tools: [{ functionDeclarations: [DECL] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["fill_profile"] } }
  };
}

/** Werkzeugaufruf aus der Antwort von Gemini lesen und prüfen */
export function setupFromGemini(res: unknown): SetupAi {
  const parts = (res as { candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[] })?.candidates?.[0]?.content?.parts || [];
  const call = parts.find(p => p.functionCall?.name === "fill_profile")?.functionCall;
  return parseSetupAi(call?.args);
}

/** Anfrage an den Such-Dienst: nur Text, gekürzt */
export function parseSetupRequest(body: unknown): { text: string } | string {
  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text.trim() : "";
  if (text.length < 3) return "Text fehlt";
  return { text: text.slice(0, SETUP_TEXT_MAX) };
}
