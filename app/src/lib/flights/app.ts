/* Flugsuche in der App: Anfrage aus der Reise, Ergebnis als Angebot in einen Flug-Posten */
import { ageClass } from "../calc";
import { hhKey, isActive, uid, type FlightLeg, type Item, type Option, type Trip } from "../model";
import { nights } from "../format";
import { accessFor, airportsOf, roadKm } from "../calc/travel";
import type { FlightOffer, FlightQuery, OfferLeg, SearchResult } from "./types";

/** Adresse des Such-Dienstes (Cloudflare Worker); leer: noch nicht eingerichtet */
export const FLIGHTS_URL = (import.meta.env.VITE_FLIGHTS_URL as string | undefined)?.replace(/\/$/, "") || "";

/** Personen der Reise für die Suche: Babys (unter 2, nur mit bekanntem Alter) auf dem Schoß, sonst Kinder mit Sitz */
export function passengers(trip: Trip): Pick<FlightQuery, "adults" | "children" | "infants"> {
  let adults = 0, children = 0, infants = 0;
  for (const t of trip.travelers.filter(isActive)) {
    const c = ageClass(t.age, trip.settings, t.kind);
    if (c === "adult") adults++;
    else if (t.age != null && (t.age as unknown) !== "" && t.age < 2) infants++;
    else children++;
  }
  return { adults: Math.max(1, adults), children, infants: Math.min(infants, Math.max(1, adults)) };
}

/**
 * Vorschlag für die Suche: Wohnort der ersten Familie, Ort und Daten der Reise.
 * Flexibel: Reisezeitraum als Fenster, Nächte von (Dauer − 2) bis Dauer; ohne Daten 7 bis 14 Nächte.
 */
export function defaultQuery(trip: Trip, lastFrom = ""): FlightQuery {
  const first = trip.travelers.find(isActive);
  const home = first ? trip.households?.[hhKey(first)]?.geo?.ort : undefined;
  const n = nights(trip.from, trip.to);
  return {
    from: lastFrom || home || "", to: trip.place || "", depart: trip.from || "", ret: trip.to || undefined,
    latest: trip.to || "", nightsMin: n ? Math.max(1, n - 2) : 7, nightsMax: n || 14,
    ...passengers(trip), currency: "EUR"
  };
}

const legOf = (dir: FlightLeg["dir"], l: OfferLeg): FlightLeg => ({ dir, from: l.from, to: l.to, dep: l.dep.slice(0, 16), arr: l.arr.slice(0, 16), carrier: l.carriers.join(" / "), stops: l.stops });

export const stopsText = (n: number) => (n ? `${n} Umstieg${n > 1 ? "e" : ""}` : "direkt");

/** Suchergebnis als Angebot: Gesamtpreis für alle, gleich verteilt; mit Quelle und Link */
export function offerToOption(o: FlightOffer): Option {
  return {
    id: uid(),
    label: `${o.out.carriers.join(" / ")} ab ${o.out.from}, ${stopsText(o.out.stops)}`,
    detail: [o.out.route.join(" → "), o.back ? o.back.route.join(" → ") : ""].filter(Boolean).join(" · "),
    price: { mode: "unit", currency: o.currency, unit: o.price },
    source: { name: o.sourceName, at: new Date().toISOString().slice(0, 10), url: o.url },
    legs: [legOf("out", o.out), ...(o.back ? [legOf("back", o.back)] : [])]
  };
}

/** Übernehmen: erstes Ergebnis legt einen Flug-Posten an, weitere kommen als Angebote zum Vergleichen dazu */
export function takeOffer(trip: Trip, o: FlightOffer, into?: string): Item {
  const opt = offerToOption(o);
  const target = into ? trip.items.find(i => i.id === into) : undefined;
  if (target) { target.options.push(opt); return target; }
  const item: Item = { id: uid(), cat: "flights", name: `Flug ${o.out.fromCity || o.out.from} – ${o.out.toCity || o.out.to}`, status: "idea", options: [opt] };
  trip.items.push(item);
  return item;
}

export async function searchFlights(q: FlightQuery, signal?: AbortSignal): Promise<SearchResult> {
  if (!FLIGHTS_URL) throw new Error("Der Such-Dienst ist noch nicht eingerichtet.");
  const res = await fetch(`${FLIGHTS_URL}/flights/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Such-Dienst antwortet mit ${res.status}`);
  return data as SearchResult;
}

/* ---------- Mehrere Abflughäfen vergleichen (wie im Artefakt) ---------- */

/** Standard-Auswahl: die n nächsten Flughäfen zum Wohnort der ersten Familie, sonst die ersten der Liste */
export function nearestAirports(trip: Trip, n = 4): string[] {
  const aps = airportsOf(trip);
  const first = trip.travelers.find(isActive);
  const geo = first ? trip.households?.[hhKey(first)]?.geo : undefined;
  if (!geo) return aps.slice(0, n).map(a => a.code);
  return [...aps].sort((a, b) => (roadKm(geo, a) ?? 0) - (roadKm(geo, b) ?? 0)).slice(0, n).map(a => a.code);
}

/** Minuten seit Epoche für eine lokale Zeit (ohne Zeitzone) */
export const tMin = (iso: string) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2})?:?(\d{2})?/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000 : NaN;
};
/** Gepäck und Weg zum Auto oder Bahnsteig nach der Landung */
export const EXIT_H = 0.75;

export interface Rated extends FlightOffer {
  /** Abflughafen der Suche */
  origin: string;
  access: number;
  accessHours: number;
  /** Flug plus Anfahrt (wenn eingerechnet) */
  total: number;
  /** wieder zu Hause (Minuten seit Epoche), nur mit Rückflug */
  home: number;
  nights: number | null;
}

/** Anfahrt aller Familien zum Flughafen (hin und zurück, Parken für die Reisetage), dazu „zuhause ca.“ */
export function rate(trip: Trip, o: FlightOffer, origin: string, withAccess: boolean): Rated {
  const ap = airportsOf(trip).find(a => a.code === (o.out.from || origin)) ?? airportsOf(trip).find(a => a.code === origin);
  const counts: Record<string, number> = {};
  trip.travelers.filter(isActive).forEach(t => (counts[hhKey(t)] = (counts[hhKey(t)] || 0) + 1));
  const days = o.back ? Math.max(1, nights(o.out.dep.slice(0, 10), o.back.arr.slice(0, 10)) + 1) : Math.max(1, nights(trip.from, trip.to) + 1);
  let cost = 0, hours = 0;
  if (ap) for (const hh in counts) { const a = accessFor(hh, ap, counts[hh], days, trip); cost += a.cost; hours = Math.max(hours, a.hours); }
  return {
    ...o, origin, access: Math.round(cost), accessHours: hours, total: o.price + (withAccess ? Math.round(cost) : 0),
    home: o.back ? tMin(o.back.arr) + Math.round((hours + EXIT_H) * 60) : NaN,
    nights: o.back ? nights(o.out.arr.slice(0, 10), o.back.dep.slice(0, 10)) : null
  };
}

/** spätestens zu Hause: Datum und Uhrzeit als Minuten */
export const deadline = (date?: string, clock = "22:00") => (date ? tMin(`${date}T${/^\d{2}:\d{2}$/.test(clock) ? clock : "22:00"}`) : NaN);

export interface CompareRow { code: string; price: number; access: number; total: number; hours: number; direct: number | null; count: number; error?: string }

/** Vergleich je Flughafen: günstigster Treffer, Anfahrt, gesamt, Reisezeit (Flug + 2 × Anfahrt), günstigster Direktflug */
export function compareRow(code: string, list: Rated[], error?: string): CompareRow {
  if (!list.length) return { code, price: 0, access: 0, total: 0, hours: 0, direct: null, count: 0, error: error || "keine Verbindung gefunden" };
  const cheap = list.reduce((a, b) => (b.total < a.total ? b : a));
  const dir = list.filter(o => !o.out.stops && !o.back?.stops);
  const flightH = (cheap.out.minutes + (cheap.back?.minutes || 0)) / 60;
  return {
    code, price: cheap.price, access: cheap.access, total: cheap.total, hours: flightH + 2 * cheap.accessHours,
    direct: dir.length ? dir.reduce((a, b) => (b.total < a.total ? b : a)).total : null, count: list.length
  };
}

/** Wochentag, Datum, Uhrzeit aus Minuten, z. B. „Mo 29.07. 18:10“ */
export function fmtMin(mins: number): string {
  const d = new Date(mins * 60000), p = (n: number) => String(n).padStart(2, "0");
  return `${["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getUTCDay()]} ${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}. ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
