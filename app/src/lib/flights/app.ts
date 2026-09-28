/* Flugsuche in der App: Anfrage aus der Reise, Ergebnis als Angebot in einen Flug-Posten */
import { ageClass } from "../calc";
import { hhKey, isActive, uid, type FlightLeg, type Item, type Option, type Trip } from "../model";
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

/** Vorschlag für die Suche: Wohnort der ersten Familie, Ort und Daten der Reise */
export function defaultQuery(trip: Trip, lastFrom = ""): FlightQuery {
  const first = trip.travelers.find(isActive);
  const home = first ? trip.households?.[hhKey(first)]?.geo?.ort : undefined;
  return { from: lastFrom || home || "", to: trip.place || "", depart: trip.from || "", ret: trip.to || undefined, ...passengers(trip), currency: "EUR" };
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
