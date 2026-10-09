import { t } from "./i18n/index.svelte";
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
