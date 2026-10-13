/*
 * Split&Fly vermittelt nicht, sondern leitet weiter: kein Reiseveranstalter, keine Pauschalreise, der Vertrag kommt nur
 * mit dem jeweiligen Anbieter zustande. Der Hinweis steht unter jeder Ergebnisliste (BrokerNote) und beim Wechsel zum
 * Anbieter (BrokerGate), bis man „nicht mehr anzeigen“ wählt (nur dieser Haken liegt im Browser).
 */
export { providerName } from "./broker";

const KEY = "rk2-broker-ok";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

export const broker = $state<{ ok: boolean; pending: { href: string; name: string; sponsored: boolean; go: () => void } | null }>({ ok: read(), pending: null });

export function acknowledge(forever: boolean) {
  if (!forever) return;
  broker.ok = true;
  try { localStorage.setItem(KEY, "1"); } catch { /* egal */ }
}
