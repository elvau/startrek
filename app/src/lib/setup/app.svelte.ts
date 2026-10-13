/* Konto einrichten (#160, #330): Fenster öffnen, nach der Anmeldung einmal von selbst, neu starten, KI-Vorbefüllung über den Such-Dienst */
import { t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { idToken } from "../cloud/cloud.svelte";
import { agentError } from "../agent/app";
import { noteError } from "../bugs/log";
import { parseSetupAi, type SetupAi } from "./ai";
import { dir } from "../directory.svelte";

export const setupWizard = $state({ open: false });

/** Ersteinrichtung neu starten (#330): von vorn, bisherige Angaben bleiben und sind vorbefüllt; bis zum Abschluss offen */
export function restartSetup() {
  delete dir.setup;
  setupWizard.open = true;
}
/** automatisierte Browser (e2e) starten den Assistenten nur, wenn der Test es will */
export function autoAllowed(): boolean {
  try { return !navigator.webdriver || !!localStorage.getItem("rk2-setup-auto"); } catch { return false; }
}

export async function askSetup(text: string): Promise<{ fields: SetupAi; remaining?: number }> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new Error(t("ai.needLogin"));
  const res = await fetch(`${FLIGHTS_URL}/setup`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ text })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    noteError(`Einrichten ${res.status}: ${data.error || "ohne Meldung"}`);
    // Such-Dienst noch ohne diese Route (neue Version noch nicht ausgerollt)
    if (res.status === 404) throw new Error(t("setup.aiMissing"));
    throw new Error(agentError(res.status, data.error, data.overloaded === true));
  }
  return { fields: parseSetupAi(data.fields), remaining: data.remaining };
}
