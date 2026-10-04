/*
 * Grenzregeln: Schengen-Raum mit EES (Ein- und Ausreisesystem) bzw. ETIAS für Pässe von außerhalb der EU, und die
 * Mindestgültigkeit des Reisepasses je Zielland (gilt für die meisten Pässe; einzelne Staatsangehörigkeiten haben
 * Ausnahmen). Kurze Hinweise, Stand Oktober 2026;
 * maßgeblich sind die verlinkten offiziellen Stellen. Quellen in docs/ZIELE.md.
 */

/** Schengen-Raum (seit 2025 mit Bulgarien und Rumänien); Zypern und Irland gehören nicht dazu */
export const SCHENGEN = new Set(["AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH"]);

/** EU, EWR und Schweiz: Freizügigkeit, kein EES und kein ETIAS */
export const FREE_MOVEMENT = new Set([...SCHENGEN, "CY", "IE"]);

export const EES_LINKS = [
  { label: "EES (EU)", url: "https://travel-europe.europa.eu/ees_en" },
  { label: "ETIAS (EU)", url: "https://travel-europe.europa.eu/etias_en" }
];

/** Mindestgültigkeit des Reisepasses: Monate bzw. Tage ab Einreise oder über die Ausreise hinaus */
export interface MinValid { months?: number; days?: number; from: "entry" | "exit" }

export const MIN_VALID: Record<string, MinValid> = {
  // Asien
  TH: { months: 6, from: "entry" }, ID: { months: 6, from: "entry" }, VN: { months: 6, from: "entry" }, KH: { months: 6, from: "entry" },
  LA: { months: 6, from: "entry" }, MM: { months: 6, from: "entry" }, LK: { months: 6, from: "entry" }, IN: { months: 6, from: "entry" },
  NP: { months: 6, from: "entry" }, MY: { months: 6, from: "entry" }, SG: { months: 6, from: "entry" }, PH: { months: 6, from: "exit" },
  CN: { months: 6, from: "entry" },
  // Naher Osten und Afrika
  EG: { months: 6, from: "entry" }, AE: { months: 6, from: "entry" }, JO: { months: 6, from: "entry" }, OM: { months: 6, from: "entry" },
  SA: { months: 6, from: "entry" }, KE: { months: 6, from: "entry" }, TZ: { months: 6, from: "entry" }, UG: { months: 6, from: "entry" },
  RW: { months: 6, from: "entry" }, ZA: { days: 30, from: "exit" },
  // Europa und Ozeanien
  TR: { days: 150, from: "entry" }, NZ: { months: 3, from: "exit" }
};

const addMonths = (iso: string, m: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** bis wann der Pass mindestens gültig sein muss (JJJJ-MM-TT); ohne Regel: bis zum Ende der Reise */
export function validUntil(rule: MinValid | undefined, from: string, to: string): string {
  if (!rule) return to;
  const base = rule.from === "entry" ? from : to;
  const need = rule.months ? addMonths(base, rule.months) : addDays(base, rule.days || 0);
  return need > to ? need : to;
}
