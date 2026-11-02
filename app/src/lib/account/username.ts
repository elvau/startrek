/*
 * Öffentlicher Benutzername (#650, Entscheidung #648): bei der Kontoerstellung gewählt, öffentlich sichtbar (Ersteller im
 * Reisekatalog, später Freundeslisten). Eindeutig ohne Groß-/Kleinschreibung über usernames/{schlüssel} in Firestore.
 * Gleiche Regeln in app/firestore.rules (Länge, Zeichen).
 */
export const NAME_MIN = 3, NAME_MAX = 20;
/** Buchstaben (auch Umlaute), Ziffern, Punkt, Unterstrich; nicht mit Punkt beginnen oder enden */
export const NAME_RE = /^[\p{L}\p{N}_](?:[\p{L}\p{N}._]*[\p{L}\p{N}_])?$/u;
/** gesperrte Namen (Teilwort genügt bei Marken und Rollen) */
const RESERVED = ["splitandfly", "split&fly", "splitfly", "admin", "support", "moderator", "anthropic", "claude", "root", "system", "team", "official", "offiziell"];
const BAD = ["arsch", "fick", "fuck", "nazi", "hitler", "hure", "wichser", "nigger", "neger", "schlampe", "bitch", "cunt"];

export type NameProblem = "short" | "long" | "chars" | "reserved" | "contact" | "rude";

export const usernameKey = (s: string) => s.trim().toLowerCase();

export function checkUsername(raw: string): NameProblem | null {
  const s = raw.trim();
  if (s.length < NAME_MIN) return "short";
  if (s.length > NAME_MAX) return "long";
  if (/\d{6,}/.test(s)) return "contact";
  if (!NAME_RE.test(s)) return "chars";
  const k = usernameKey(s).replace(/[._]/g, "");
  if (RESERVED.some(r => k.includes(r.replace(/[^a-z]/g, "")))) return "reserved";
  if (BAD.some(b => k.includes(b))) return "rude";
  return null;
}

/** Vorschlag wie bei den Platzhaltern: Tiername und Zahl („reh42“) */
export function suggestUsername(animal: string, rnd = Math.random): string {
  const base = animal.toLowerCase().replace(/[^\p{L}]/gu, "").slice(0, 14) || "reise";
  return `${base}${10 + Math.floor(rnd() * 90)}`;
}
