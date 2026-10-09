/** Browser-Meldung bei fehlender Verbindung („Failed to fetch“, „Load failed“, „NetworkError …“) */
export const isNetworkError = (e: unknown) =>
  e instanceof TypeError && /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(e.message);

/** Schlüssel der übersetzten Meldung; Such-Quellen tragen ihn als Fehler ein, die Oberfläche übersetzt ihn (`showError`) */
export const NET_FAILED = "net.failed";

/** Fehler → Text für Quellen-Status (ohne Übersetzung, auch im Worker nutzbar) */
export const errorText = (e: unknown): string => (isNetworkError(e) ? NET_FAILED : (e as Error)?.message || String(e));
