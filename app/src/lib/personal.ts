/*
 * Persönliche Reisehinweise (#302): für Frauen, Passeintrag „X“ und LGBTQ+ je Reiseland (public/hinweise.json aus
 * Mignot/Our World in Data und den britischen Reisehinweisen, scripts/hinweise.mjs). Nur für die Person selbst („Ich bin“),
 * berechnet nur im Browser aus den Angaben im Konto (travelDocs: Geschlecht, Schalter LGBTQ+). Nichts davon landet in
 * der Reise (auch nicht als „gelesen“), bei Mitreisenden, KI, Such-Dienst oder in Fehlermeldungen.
 */
import type { TravelDoc } from "./model";

export type LgbtLevel = "death" | "crime" | "restrict";
export type WomenTag = "dress" | "guardian" | "safety";

export interface SafetyData {
  asOf?: string;
  sources?: string[];
  lgbt: Record<string, LgbtLevel>;
  /** Stichworte je Land, kommagetrennt */
  women: Record<string, string>;
  /** Hinweise zum Geschlechtseintrag „X“ (aus dem FCDO-Text) und von Hand gepflegte Länder */
  x: string[];
  xManual?: string[];
  /** Seite der britischen Reisehinweise (gov.uk/foreign-travel-advice/…) */
  fcdo?: Record<string, string>;
}

export type PersonalHint =
  | { kind: "women"; cc: string; tags: WomenTag[] }
  | { kind: "x"; cc: string }
  /** allgemein für Reisen ins Ausland mit „X“ im Pass, ohne bekannte Probleme im Land */
  | { kind: "xAny" }
  | { kind: "lgbt"; cc: string; level: LgbtLevel };

const TAGS: WomenTag[] = ["dress", "guardian", "safety"];
const STRENGTH: Record<LgbtLevel, number> = { death: 0, crime: 1, restrict: 2 };

/**
 * Hinweise für eine Person in die Reiseländer (ISO-2); eigene Staatsangehörigkeiten zählen nicht als Ausland.
 * Ohne Angaben (kein Geschlecht w/x, Schalter aus) bzw. ohne Daten: keine.
 */
export function personalHints(data: SafetyData | null, doc: Pick<TravelDoc, "gender" | "lgbtq" | "nats"> | undefined, countries: string[]): PersonalHint[] {
  if (!data || !doc) return [];
  const own = new Set((doc.nats || "").split(",").filter(Boolean));
  const abroad = [...new Set(countries)].filter(cc => !own.has(cc));
  const out: PersonalHint[] = [];
  if (doc.gender === "f") for (const cc of abroad) {
    const tags = (data.women[cc] || "").split(",").filter((t): t is WomenTag => TAGS.includes(t as WomenTag));
    if (tags.length) out.push({ kind: "women", cc, tags });
  }
  if (doc.gender === "x" && abroad.length) {
    const xs = new Set([...(data.x || []), ...(data.xManual || [])]);
    const hit = abroad.filter(cc => xs.has(cc));
    for (const cc of hit) out.push({ kind: "x", cc });
    if (!hit.length) out.push({ kind: "xAny" });
  }
  if (doc.lgbtq === "1") {
    const ls = abroad.filter(cc => data.lgbt[cc]).map(cc => ({ kind: "lgbt" as const, cc, level: data.lgbt[cc] }));
    out.push(...ls.sort((a, b) => STRENGTH[a.level] - STRENGTH[b.level]));
  }
  return out;
}

/** Quelle je Land: britische Reisehinweise (Abschnitt „Laws and cultural differences“ bzw. Einreise) */
export const fcdoUrl = (d: SafetyData | null, cc: string) => (d?.fcdo?.[cc] ? `https://www.gov.uk/foreign-travel-advice/${d.fcdo[cc]}` : undefined);

export const SOURCES = "FCDO (Open Government Licence v3.0), Mignot (2026) / Our World in Data (CC BY 4.0)";
export const FCDO_LGBT_URL = "https://www.gov.uk/guidance/lesbian-gay-bisexual-and-transgender-foreign-travel-advice";
export const OWID_URL = "https://ourworldindata.org/grapher/same-sex-sexual-acts-legal-mignot";
export const ILGA_URL = "https://database.ilga.org/";

const base = () => (import.meta.env?.BASE_URL as string | undefined) || "/";
let cache: Promise<SafetyData | null> | undefined;
export function loadSafety(fetchFn: typeof fetch = fetch): Promise<SafetyData | null> {
  return (cache ??= fetchFn(base() + "hinweise.json").then(r => (r.ok ? r.json() : null)).catch(() => null));
}
