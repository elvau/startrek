/* Ungefährer Ort aus der Verbindung (Such-Dienst /where), einmal je Sitzung, nur im Speicher */
import type { Where } from "./origin";

const URL_ = (import.meta.env.VITE_FLIGHTS_URL as string | undefined)?.replace(/\/$/, "") || "";

export const origin = $state<{ where: Where | null }>({ where: null });

let asked = false;
export function loadOrigin() {
  if (asked || !URL_) return;
  asked = true;
  void fetch(`${URL_}/where`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((w: Where | null) => { if (w && (w.cc || w.lat != null)) origin.where = w; })
    .catch(() => {});
}
