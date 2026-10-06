/*
 * Camper bzw. Wohnmobil (#203): Richtwerte (Hauptsaison, grob, ohne Gewähr; Stand und Quellen in docs/NEBENKOSTEN.md).
 * Campingplatz für 2 Personen mit Camper und Strom bzw. Stellplatz je Nacht und Land, Mietcamper, Kilometersatz,
 * Maut für Fahrzeuge über 2 m Höhe bzw. über 3,5 t, Fähre mit Camper-Tarif.
 */

/**
 * je Land: ACSI-Durchschnitt Hochsaison 2026 (2 Erwachsene + 2 Kinder, Camper, Strom, Kurtaxe), Wohnmobil-Stellplatz
 * (grobe Mitte aus Ratgebern, fehlt er: STELLPLATZ); EUR je Nacht
 */
export interface Camping { acsi: number; pitch?: number }
export const CAMPING: Record<string, Camping> = {
  HR: { acsi: 78.28 }, CH: { acsi: 61.33 }, SI: { acsi: 60.14 }, IT: { acsi: 58.86, pitch: 22 }, DK: { acsi: 53.83, pitch: 22 },
  NO: { acsi: 53.82, pitch: 22 }, AT: { acsi: 51.89 }, ES: { acsi: 48.81, pitch: 15 }, GB: { acsi: 44.43 }, FR: { acsi: 42.33, pitch: 10 },
  DE: { acsi: 40.82, pitch: 15 }, NL: { acsi: 39.15 }, IE: { acsi: 37.55 }, GR: { acsi: 36.2 }, BE: { acsi: 34.67 },
  SE: { acsi: 33.78, pitch: 22 }, PT: { acsi: 32.02, pitch: 10 }, CZ: { acsi: 28.52 }, HU: { acsi: 27.72 }, PL: { acsi: 24.19 }
};
/** Land ohne Eintrag: Mittel Europa (PiNCAMP/ADAC 2026: 49 € für 2 Erwachsene + 1 Kind) */
export const CAMPING_DEFAULT: Camping = { acsi: 52 };
/** Stellplatz ohne Landeswert */
export const STELLPLATZ = 15;
export const CAMPING_SOURCE = "ACSI Campingpreise 2026, Stellplätze grob (promobil, Ratgeber)";

export const campingFor = (cc?: string) => (cc && CAMPING[cc]) || CAMPING_DEFAULT;

/**
 * Preis je Nacht: Campingplatz für die Gruppe, 2 Personen 75 % des ACSI-Werts (4 Personen), jede weitere ⅛ (Kinder 5–9 €,
 * Erwachsene etwas mehr), bzw. Stellplatz pauschal
 */
export function campNight(kind: "site" | "pitch", cc: string | undefined, persons: number): number {
  const c = campingFor(cc);
  if (kind === "pitch") return c.pitch ?? STELLPLATZ;
  return Math.round(c.acsi * 0.75 + Math.max(0, persons - 2) * c.acsi * 0.125);
}

/**
 * Mietcamper (Kastenwagen 4 Personen, Hochsaison): Tagespreis, freie km je Tag (große Vermieter meist unbegrenzt, Indie
 * Campers 100 km), Mehrkilometer, Kaution (800–2.000 €, nur Kreditkarte), Servicepauschale; Endreinigung nur bei Verschmutzung
 */
export const CAMPER_RENT = { day: 146, kmPerDay: 250, extraKm: 0.35, deposit: 1500, cleaning: 139, service: 120,
  source: "Mietpreise 2026 (milchplus Preisvergleich; McRent, Roadsurfer, Indie Campers, Rent Easy)" };

/** Kilometersatz Camper: gemietet nur Diesel (gut 10 l/100 km × 2,30 €), eigener mit Verschleiß */
export const CAMPER_KM = { rented: 0.25, own: 0.4 };

/** Maut nach Strecke: Faktor gegenüber Pkw für Camper über 2 m Höhe bis 3,5 t (FR Klasse 2, IT Klasse B, PT Klasse 2, HR Kat. II, GR Kat. 3) */
export const HEIGHT_FACTOR: Record<string, number> = { FR: 1.5, IT: 1.05, PT: 1.7, HR: 1.6, GR: 2 };

/** über 3,5 t: Streckenmaut statt Vignette (Österreich GO-Maut je km mit USt, Schweiz PSVA je Tag im Land); Deutschland, NL, BE mautfrei */
export const HEAVY = {
  AT: { perKm: 0.3, source: "ASFINAG GO-Maut 2026 (Kategorie 2, Euro VI, mit USt)" },
  CH: { perDay: 3.25, min: 25, currency: "CHF", source: "BAZG PSVA (Wohnmobile über 3,5 t)" }
};

/** Fähre: Camper-Tarif gegenüber Pkw, falls die Verbindung keinen eigenen Wert hat (bis 6 m wie Pkw, darüber +20–25 %) */
export const CAMPER_FERRY = 1.2;

export interface Vehicle { camper?: boolean; heavy?: boolean }
