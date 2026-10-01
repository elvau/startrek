/* Sind Partner-Links an? Der Such-Dienst sagt es bei /health (Schalter PARTNER_LINKS in Cloudflare); einmal je Sitzung */
import { FLIGHTS_URL } from "./flights/app";

export const partner = $state({ on: false });

let asked = false;
export function loadPartner(f: typeof fetch = fetch) {
  if (asked || !FLIGHTS_URL) return;
  asked = true;
  f(`${FLIGHTS_URL}/health`).then(r => (r.ok ? r.json() : null)).then(j => { partner.on = j?.partner === true; }).catch(() => { asked = false; });
}
