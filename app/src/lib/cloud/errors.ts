import { t } from "../i18n/index.svelte";

/** Firebase-Fehler → Text für die Oberfläche; leer: nichts anzeigen (Person hat selbst abgebrochen bzw. ein zweiter Versuch läuft) */
export function errorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup-request")) return "";
  if (code.includes("permission-denied")) return t("cloud.denied");
  if (code.includes("unavailable")) return t("cloud.offline");
  if (code.includes("unauthorized-domain")) return t("cloud.domain");
  if (code.includes("operation-not-allowed")) return t("cloud.method");
  return (e as Error)?.message || String(e);
}
