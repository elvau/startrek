/*
 * Markt der Suche (#464): Land und Sprache der suchenden Person, damit die Anbieter Preise, Steuern und Texte
 * für ihren Markt liefern statt fest für Deutschland. An den Such-Dienst geht nur der Ländercode, kein Wohnort.
 */

/** Sprachen der App, die an Anbieter gehen dürfen */
export const SEARCH_LANGS = ["de", "en", "es", "fr", "pl", "ru", "ar"] as const;

/** Ländercode (ISO-2) prüfen; ungültig: undefined (Anbieter nehmen dann Deutschland) */
export const parseMarket = (v: unknown): string | undefined =>
  typeof v === "string" && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined;

export const parseLang = (v: unknown): string | undefined =>
  typeof v === "string" && (SEARCH_LANGS as readonly string[]).includes(v) ? v : undefined;

/** Wohnland der Person „Ich“ (alte Wohnorte ohne Land: DE), ohne Wohnort die Region des Browsers, sonst DE */
export function searchMarket(home: { cc?: string } | undefined, browser?: string): string {
  if (home) return parseMarket(home.cc) || "DE";
  return parseMarket((browser || "").split(/[-_]/)[1]) || "DE";
}
