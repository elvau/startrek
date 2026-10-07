/* Sind Partner-Links an, welche Unterkunftsquellen sind angebunden? Der Such-Dienst sagt es bei /health (Schalter PARTNER_LINKS in Cloudflare); einmal je Sitzung */
import { FLIGHTS_URL } from "./flights/app";

/** stays: angebundene Quellen der Unterkunftssuche; null = unbekannt (alle wählbar) */
export const partner = $state<{ on: boolean; stays: string[] | null }>({ on: false, stays: null });

let asked = false;
export function loadPartner(f: typeof fetch = fetch) {
  if (asked || !FLIGHTS_URL) return;
  asked = true;
  f(`${FLIGHTS_URL}/health`).then(r => (r.ok ? r.json() : null)).then(j => { partner.on = j?.partner === true; partner.stays = Array.isArray(j?.stays) ? (j.stays as unknown[]).filter((x): x is string => typeof x === "string") : null; }).catch(() => { asked = false; });
}
