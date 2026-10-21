import { i18n, t } from "./i18n/index.svelte";
import { ERR_CODES, type ErrCode } from "./errcodes";
import { NET_FAILED, isNetworkError } from "./netcheck";

export { isNetworkError };

/** Fehler → Text für die Oberfläche: Verbindungsfehler verständlich und übersetzt, sonst die Meldung selbst */
export function netMessage(e: unknown): string {
  if (isNetworkError(e)) return t("net.failed");
  return (e as Error)?.message || String(e);
}

/** Fehlertext einer Such-Quelle (`errorText`) für die Anzeige: der Verbindungs-Schlüssel wird übersetzt */
export const showError = (s: string | undefined): string => (s ? s.replace(new RegExp(`${NET_FAILED.replace(".", "\\.")}$`), t("net.failed")) : "");

/** Ist der Text die Verbindungsmeldung (für „Noch einmal versuchen“) */
export const isNetText = (s: string | undefined): boolean => !!s && s === t("net.failed");

/**
 * Fehlerantwort des Such-Dienstes für die Anzeige (#466): mit Code übersetzt (err.<code>), ungültige Angaben auf Deutsch
 * mit dem genauen Text; ältere Antworten ohne Code zeigen ihren Text, sonst den Status.
 */
export function serverError(data: { error?: unknown; code?: unknown } | null | undefined, status: number): string {
  const text = typeof data?.error === "string" ? data.error : "";
  const code = typeof data?.code === "string" && (ERR_CODES as readonly string[]).includes(data.code) ? (data.code as ErrCode) : null;
  if (code) return code === "bad_request" && i18n.lang === "de" && text ? text : t(`err.${code}`);
  return text || (status === 429 ? t("search.tooMany") : t("search.status", { s: status }));
}
