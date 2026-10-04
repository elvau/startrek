/*
 * Direkt beim Anbieter suchen: Links mit Ort, Datum und Personen, ohne Schnittstelle und ohne Schlüssel.
 * Unproblematisch, weil nur eine normale Suchseite geöffnet wird (Fallback, wenn eine Quelle ausfällt).
 * In der Oberfläche laufen die Links über das Partner-Verzeichnis (partners/), das bei Bedarf die Partnerkennung anhängt.
 */
export interface StayLinkQuery { place: string; country?: string; checkin: string; checkout: string; adults: number; childAges: number[]; rooms: number }
export interface FlightLinkQuery { from: string; to: string; depart: string; ret?: string; adults: number; children: number; infants: number }

const where = (q: StayLinkQuery) => (q.country ? `${q.place}, ${q.country}` : q.place);

export function bookingLink(q: StayLinkQuery): string {
  const p = new URLSearchParams({ ss: where(q), checkin: q.checkin, checkout: q.checkout, group_adults: String(q.adults), group_children: String(q.childAges.length), no_rooms: String(q.rooms), selected_currency: "EUR" });
  q.childAges.forEach(a => p.append("age", String(a)));
  return `https://www.booking.com/searchresults.de.html?${p}`;
}

export function airbnbLink(q: StayLinkQuery): string {
  const slug = where(q).replace(/,\s*/g, "--").replace(/\s+/g, "-");
  const p = new URLSearchParams({ checkin: q.checkin, checkout: q.checkout, adults: String(q.adults) });
  const kids = q.childAges.filter(a => a >= 2).length, infants = q.childAges.length - kids;
  if (kids) p.set("children", String(kids));
  if (infants) p.set("infants", String(infants));
  return `https://www.airbnb.de/s/${encodeURIComponent(slug)}/homes?${p}`;
}

export function googleFlightsLink(q: FlightLinkQuery): string {
  const text = `Flüge von ${q.from} nach ${q.to} am ${q.depart}${q.ret ? ` zurück am ${q.ret}` : " nur Hinflug"} ${q.adults} Erwachsene${q.children ? ` ${q.children} Kinder` : ""}${q.infants ? ` ${q.infants} Babys` : ""}`;
  return `https://www.google.com/travel/flights?hl=de&curr=EUR&q=${encodeURIComponent(text)}`;
}

/** Skyscanner braucht Codes (DUS, SPU); sonst kein Link */
export function skyscannerLink(q: FlightLinkQuery, childAges: number[] = []): string | null {
  if (!/^[A-Za-z]{3}$/.test(q.from) || !/^[A-Za-z]{3}$/.test(q.to)) return null;
  const d = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  const ages = childAges.length ? childAges : [...Array(q.children).fill(8), ...Array(q.infants).fill(1)];
  const p = new URLSearchParams({ adultsv2: String(q.adults), cabinclass: "economy", ...(ages.length ? { childrenv2: ages.join("|") } : {}) });
  return `https://www.skyscanner.de/transport/flights/${q.from.toLowerCase()}/${q.to.toLowerCase()}/${d(q.depart)}/${q.ret ? `${d(q.ret)}/` : ""}?${p}`;
}

/* ---------- Erlebnisse ---------- */

export interface ActivityLinkQuery { place: string; from?: string; to?: string }

/** GetYourGuide: Suche nach Ort, mit Reisezeitraum */
export function getYourGuideLink(q: ActivityLinkQuery): string {
  const p = new URLSearchParams({ q: q.place });
  if (q.from) p.set("date_from", q.from);
  if (q.to) p.set("date_to", q.to);
  return `https://www.getyourguide.de/s/?${p}`;
}

/** Viator-Suche nach Ort (Partnerkennung hängt das Partner-Verzeichnis an) */
export const viatorLink = (q: ActivityLinkQuery) => `https://www.viator.com/de-DE/searchResults/all?text=${encodeURIComponent(q.place)}`;

export const tiqetsLink = (q: ActivityLinkQuery) => `https://www.tiqets.com/de/search?q=${encodeURIComponent(q.place)}`;

/* ---------- Essen ---------- */

export const mapsSearchLink = (what: string, place: string) => `https://www.google.com/maps/search/${encodeURIComponent(`${what} ${place}`)}`;
export const tripadvisorRestaurantsLink = (place: string) => `https://www.tripadvisor.de/Search?q=${encodeURIComponent(`Restaurants ${place}`)}`;
