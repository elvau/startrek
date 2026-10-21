/*
 * Fehlercodes des Such-Dienstes (#466): Der Dienst schickt neben dem deutschen Text einen festen Code, die App übersetzt
 * ihn (Schlüssel err.<code>). Prüfungen der Anfragen (ungültige Angaben) laufen als bad_request; den genauen deutschen
 * Text zeigt die App nur auf Deutsch. Ohne Svelte, auch für den Such-Dienst.
 */
export const ERR_CODES = [
  "origin", "bad_json", "bad_form", "too_big", "image_too_big", "image_type", "login", "no_access", "not_found",
  "not_ready", "too_many", "daily_limit", "unreadable_page", "no_offer", "unavailable", "internal", "bad_request"
] as const;
export type ErrCode = (typeof ERR_CODES)[number];

/** feste Texte des Such-Dienstes → Code */
const BY_TEXT: Record<string, ErrCode> = {
  "Herkunft nicht erlaubt": "origin",
  "Anfrage ist kein JSON": "bad_json", "Meldung ist kein JSON": "bad_json", "Anfrage ist kein Formular": "bad_form",
  "Anfrage zu groß": "too_big", "Bild ist zu groß": "image_too_big", "Nur JPG, PNG oder WebP": "image_type",
  "Bitte anmelden": "login", "Bitte anmelden, um den KI-Planer zu nutzen": "login", "Bitte anmelden, um den Import zu nutzen": "login",
  "Kein Zugriff": "no_access", "Nicht gefunden": "not_found",
  "Der KI-Planer ist noch nicht eingerichtet": "not_ready", "Der KI-Konnektor ist noch nicht eingerichtet": "not_ready",
  "Fehlermeldungen sind noch nicht eingerichtet": "not_ready",
  "Zu viele Suchen in kurzer Zeit, bitte kurz warten.": "too_many", "Zu viele Anfragen in kurzer Zeit, bitte später noch einmal.": "too_many",
  "Seite lässt sich nicht lesen": "unreadable_page", "Kein Angebot erkannt": "no_offer",
  "Kurse gerade nicht erreichbar": "unavailable", "Hinweise gerade nicht erreichbar": "unavailable",
  "Ferien gerade nicht erreichbar": "unavailable", "Ausblick gerade nicht erreichbar": "unavailable",
  "Meldung konnte nicht gespeichert werden": "unavailable",
  "Interner Fehler im Such-Dienst, bitte noch einmal versuchen.": "internal"
};

/** Code zu einer Fehlerantwort: fester Text, sonst nach Status (Prüfung der Anfrage → bad_request) */
export function errCode(text: string, status: number): ErrCode | undefined {
  if (BY_TEXT[text]) return BY_TEXT[text];
  if (/^Tageslimit erreicht|^Höchstens \d+ Schlüssel/.test(text)) return "daily_limit";
  if (status === 429) return "too_many";
  if (status === 400 || status === 413) return "bad_request";
  if (status >= 500) return status === 500 ? "internal" : "unavailable";
  return undefined;
}

/** Antwortkörper mit Code ergänzen (nur Fehler mit Text, vorhandenen Code nicht überschreiben) */
export function withCode(body: unknown, status: number): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as { error?: unknown; code?: unknown };
  if (typeof b.error !== "string" || b.code) return body;
  const code = errCode(b.error, status);
  return code ? { ...b, code } : body;
}
