/*
 * Letzte Fehler in der App (höchstens 10) für Fehlermeldungen: Fehler im Browser und abgelehnte Anfragen an den
 * Such-Dienst mit dessen Originalmeldung (die App zeigt eine übersetzte, die Meldung braucht die genaue).
 */
const recent: string[] = [];

export function noteError(s: string) {
  recent.push(`${new Date().toISOString().slice(11, 19)} ${s}`.slice(0, 500));
  if (recent.length > 10) recent.shift();
}

export const recentErrors = () => [...recent];

if (typeof addEventListener !== "undefined") {
  addEventListener("error", e => noteError(`${e.message}${e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : ""}`));
  addEventListener("unhandledrejection", e => noteError(`Promise: ${(e.reason as Error)?.message || String(e.reason)}`));
}
