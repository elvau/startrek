import { t } from "./i18n/index.svelte";

/** Browser-Meldung bei fehlender Verbindung („Failed to fetch“, „Load failed“, „NetworkError …“) */
export const isNetworkError = (e: unknown) =>
  e instanceof TypeError && /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(e.message);

/** Fehler → Text für die Oberfläche: Verbindungsfehler verständlich und übersetzt, sonst die Meldung selbst */
export function netMessage(e: unknown): string {
  if (isNetworkError(e)) return t("net.failed");
  return (e as Error)?.message || String(e);
}
