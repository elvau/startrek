/*
 * Klicks auf Anbieter-Links zählen: je Partner, Kategorie und Tag im Such-Dienst (/click), ohne IP, Konto oder Reise.
 * Läuft nebenher (sendBeacon), der Link öffnet sofort; klappt das Senden nicht, wird eben nicht gezählt.
 */
import { FLIGHTS_URL } from "../flights/app";

/** Kennung für die Zählung: klein, nur Buchstaben, Ziffern und Bindestrich („Booking.com Taxi“ → booking-com-taxi) */
export const clickId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Kategorie für die Zählung (Verzeichnis oder Kapitel des Postens) */
export const clickCat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").slice(0, 20);

export function countClick(partner: string, cat: string, base = FLIGHTS_URL, nav: Pick<Navigator, "sendBeacon"> | undefined = globalThis.navigator) {
  const p = clickId(partner), c = clickCat(cat);
  if (!base || !p || !c) return;
  const url = `${base}/click`, body = JSON.stringify({ p, c });
  try { if (nav?.sendBeacon?.(url, body)) return; } catch { /* weiter mit fetch */ }
  fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
}
