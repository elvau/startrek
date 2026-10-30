/*
 * Expedia (expedia.de): Such-Links mit vorausgefüllten Angaben für Hotel, Flug, Flug + Hotel, Mietwagen und Aktivitäten.
 * Aufbau nach den Suchmasken von expedia.de (10/2026); Partnerkennung über CJ hängt das Partner-Verzeichnis an.
 */
import type { CarWindow } from "../extras";
import type { ActivityLinkQuery, FlightLinkQuery, StayLinkQuery } from "../links";

const BASE = "https://www.expedia.de";
/** Expedia-Datum in Flug- und Mietwagensuche: TT.MM.JJJJ */
const de = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
/** Uhrzeit der Mietwagensuche: 13:00 → 0100PM */
const ampm = (hm: string) => {
  const h = Number(hm.slice(0, 2)), m = hm.slice(3, 5);
  return `${String(h % 12 || 12).padStart(2, "0")}${m}${h < 12 ? "AM" : "PM"}`;
};
/** Alter der Kinder: ohne Angaben 8 Jahre je Kind, 1 Jahr je Baby (wie bei Skyscanner) */
const ages = (q: FlightLinkQuery, childAges?: number[]) => childAges?.length ? childAges : [...Array(q.children).fill(8), ...Array(q.infants).fill(1)];

/** Erwachsene und Kinder auf Zimmer verteilt: adults=2,2 und children=1_8,2_5 (Zimmer_Alter) */
function guests(p: URLSearchParams, adults: number, childAges: number[], rooms: number) {
  const r = Math.max(1, Math.min(rooms, adults));
  p.set("rooms", String(r));
  p.set("adults", Array.from({ length: r }, (_, i) => Math.floor(adults / r) + (i < adults % r ? 1 : 0)).join(","));
  if (childAges.length) p.set("children", childAges.map((a, i) => `${(i % r) + 1}_${a}`).join(","));
}

export function expediaHotelLink(q: StayLinkQuery): string {
  const p = new URLSearchParams({ destination: q.country ? `${q.place}, ${q.country}` : q.place, startDate: q.checkin, endDate: q.checkout });
  guests(p, q.adults, q.childAges, q.rooms);
  if (q.pets) p.set("amenities", "PETS");
  return `${BASE}/Hotel-Search?${p}`;
}

export function expediaFlightLink(q: FlightLinkQuery & { toName?: string }): string {
  const leg = (a: string, b: string, d: string) => `from:${a},to:${b},departure:${de(d)}TANYT`;
  const kids = ages(q);
  const p = new URLSearchParams({ trip: q.ret ? "roundtrip" : "oneway", leg1: leg(q.from, q.to, q.depart) });
  if (q.ret) p.set("leg2", leg(q.to, q.from, q.ret));
  p.set("passengers", `adults:${q.adults},children:${kids.length}${kids.length ? `[${kids.join(";")}]` : ""},infantinlap:N`);
  p.set("options", "cabinclass:economy");
  p.set("mode", "search");
  return `${BASE}/Flights-Search?${p}`;
}

/** Flug + Hotel (Pauschalreise): nur mit Rückflug, Hotel am Ziel für die Reisedauer */
export function expediaPackageLink(q: FlightLinkQuery & { toName?: string }): string | null {
  if (!q.ret) return null;
  const p = new URLSearchParams({ packageType: "fh", origin: q.from, destination: q.toName || q.to, startDate: q.depart, endDate: q.ret });
  guests(p, q.adults, ages(q), 1);
  return `${BASE}/Hotel-Search?${p}`;
}

export function expediaCarLink(q: { w: CarWindow | null; place: string }): string | null {
  const locn = q.w?.ap || q.place;
  if (!locn) return null;
  const p = new URLSearchParams({ locn });
  if (q.w) {
    if (q.w.dropAp && q.w.dropAp !== q.w.ap) p.set("loc2", q.w.dropAp);
    p.set("date1", de(q.w.pick));
    p.set("time1", ampm(q.w.pick.slice(11, 16)));
    p.set("date2", de(q.w.drop));
    p.set("time2", ampm(q.w.drop.slice(11, 16)));
  }
  return `${BASE}/carsearch?${p}`;
}

export function expediaActivityLink(q: ActivityLinkQuery): string {
  const p = new URLSearchParams({ location: q.place });
  if (q.from) p.set("startDate", q.from);
  if (q.to) p.set("endDate", q.to);
  return `${BASE}/things-to-do/search?${p}`;
}
