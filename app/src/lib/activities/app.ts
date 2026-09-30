/* Erlebnisse in der Reise: Events vor Ort und Touren (Viator) suchen, als Posten in „Erlebnisse“ übernehmen */
import { t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { uid, type Item, type Trip } from "../model";
import { dayShort } from "../format";
import type { EventHit, EventQuery, EventSearchResult } from "../events/types";
import type { ActivityHit, ActivityQuery, ActivitySearchResult } from "./types";

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const res = await fetch(`${FLIGHTS_URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 429 ? t("search.tooMany") : data.error || t("search.status", { s: res.status }));
  return data as T;
}

export const searchLocalEvents = (q: EventQuery, signal?: AbortSignal) => post<EventSearchResult>("/events/search", q, signal);
export const searchActivitiesRemote = (q: ActivityQuery, signal?: AbortSignal) => post<ActivitySearchResult>("/activities/search", q, signal);

/** Preis nur in Euro übernehmen (ohne Kurs würde ein Dollarpreis als Euro zählen); sonst trägt man ihn selbst ein */
const eur = (price: number | undefined, currency: string) => (price != null && price > 0 && currency === "EUR" ? price : 0);

/** Posten für ein Event: Name, Termin und Ort als Notiz, Ticketpreis ab pro Person, Link zu den Tickets */
export function eventItem(h: EventHit): Item {
  const when = `${dayShort(h.start.slice(0, 10))}${h.start.length > 10 ? ` ${h.start.slice(11, 16)}` : ""}`;
  const where = [h.venue, h.city].filter(Boolean).join(", ");
  const adult = eur(h.price?.min, h.price?.currency || "");
  return {
    id: uid(), cat: "attractions", name: h.name, status: "idea",
    note: [when, where].filter(Boolean).join(" · "),
    options: [{
      id: uid(), label: h.name, detail: [when, where].filter(Boolean).join(" · "),
      price: { mode: "person", currency: "EUR", adult }, ...(adult ? {} : { estimate: true }),
      source: { name: h.sourceName, at: new Date().toISOString().slice(0, 10), ...(h.url ? { url: h.url } : {}) }
    }]
  };
}

/** Posten für eine Tour: Preis ab pro Person (Kinder zahlen oft weniger, das trägt man bei Bedarf ein) */
export function activityItem(a: ActivityHit): Item {
  const adult = eur(a.price, a.currency);
  const facts = [a.rating ? `★ ${a.rating.toFixed(1)}${a.reviews ? ` (${a.reviews})` : ""}` : "", a.minutes ? duration(a.minutes) : ""].filter(Boolean).join(" · ");
  return {
    id: uid(), cat: "attractions", name: a.title, status: "idea",
    options: [{
      id: uid(), label: a.title, ...(facts ? { detail: facts } : {}),
      price: { mode: "person", currency: "EUR", adult }, ...(adult ? {} : { estimate: true }),
      source: { name: a.sourceName, at: new Date().toISOString().slice(0, 10), ...(a.url ? { url: a.url } : {}) }
    }]
  };
}

export const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.round((min / 60) * 10) / 10} h`.replace(".", ","));

/** Posten anlegen (Erlebnisse müssen vorher detailliert sein, siehe setDetailed) */
export function takeInto(trip: Trip, item: Item): Item {
  trip.items.push(item);
  return item;
}
