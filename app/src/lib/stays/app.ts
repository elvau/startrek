/* Unterkunftssuche in der App: Anfrage aus der Reise, Treffer als Angebot in einen Unterkunft-Posten */
import { t } from "../i18n/index.svelte";
import { isActive, uid, type Item, type Option, type Traveler, type Trip } from "../model";
import { FLIGHTS_URL } from "../flights/app";
import type { StayOffer, StayQuery, StaySearchResult, StayType } from "./types";

/** Gäste: Erwachsene und Alter der Kinder (Hotels rechnen bis 17 als Kind); ohne Alter: Kind 8, Baby 1 */
export function guests(people: Traveler[]): Pick<StayQuery, "adults" | "childAges"> {
  let adults = 0;
  const childAges: number[] = [];
  for (const t of people) {
    const age = t.age != null && (t.age as unknown) !== "" ? Number(t.age) : null;
    if (age != null && isFinite(age)) { if (age >= 18) adults++; else childAges.push(Math.max(0, Math.min(17, Math.round(age)))); }
    else if (t.kind === "child") childAges.push(8);
    else if (t.kind === "infant") childAges.push(1);
    else adults++;
  }
  return { adults: Math.max(1, adults), childAges };
}

/** Wer in diesem Posten schläft: eingetragene Beteiligte, sonst alle, die dabei sind */
export const sleepers = (trip: Trip, item?: Item) =>
  trip.travelers.filter(t => isActive(t) && (!item?.participants || item.participants.includes(t.id)));

export function defaultStayQuery(trip: Trip, item?: Item, type: StayType = "whole"): StayQuery {
  return {
    place: trip.place || "", country: trip.country || undefined,
    checkin: item?.from || trip.from || "", checkout: item?.to || trip.to || "",
    ...guests(sleepers(trip, item)), rooms: 1, type, currency: "EUR"
  };
}

/** Treffer als Angebot: Gesamtpreis für den Aufenthalt, auf die Gäste verteilt; mit Quelle und Link */
export function stayToOption(o: StayOffer, people: number): Option {
  return {
    id: uid(),
    label: o.name,
    detail: o.place,
    price: { mode: "unit", basis: "stay", currency: o.currency, unit: Math.round(o.total), capacity: Math.max(1, people) },
    source: { name: o.via && o.via !== o.sourceName ? t("st.via", { a: o.sourceName, b: o.via }) : o.sourceName, at: new Date().toISOString().slice(0, 10), url: o.url },
    stay: { stars: o.stars, rating: o.score != null ? Math.round(o.score * 10) : undefined, facts: o.facts?.length ? o.facts : undefined, ...(o.board ? { board: o.board } : {}), ...(o.image && /^https:\/\//.test(o.image) ? { image: o.image } : {}) }
  };
}

/** leer angelegter Posten („+ Unterkunft“ ohne Angaben) */
const blank = (it: Item) => it.options.length === 1 && !it.options[0].label && !it.options[0].price.unit && !it.options[0].price.adult;

/**
 * Übernehmen: erstes Ergebnis füllt einen leeren Unterkunft-Posten oder legt einen an,
 * weitere kommen als Angebote zum Vergleichen dazu.
 */
export function takeStay(trip: Trip, o: StayOffer, q: StayQuery, into?: string, ids?: string[]): Item {
  const opt = stayToOption(o, q.adults + q.childAges.length);
  opt.query = { place: q.place, country: q.country, checkin: q.checkin, checkout: q.checkout, adults: q.adults, childAges: [...q.childAges], rooms: q.rooms };
  const target = into ? trip.items.find(i => i.id === into) : undefined;
  if (target) { target.options.push(opt); return target; }
  // nur ein Teil der Reisenden (z. B. eine Familie, die früher kommt)
  const act = trip.travelers.filter(isActive).map(t => t.id);
  const part = ids?.length && act.some(id => !ids.includes(id)) ? ids.filter(id => act.includes(id)) : undefined;
  const empty = !part ? trip.items.find(i => i.cat === "stay" && !i.participants && blank(i) && (!i.from || i.from === q.checkin) && (!i.to || i.to === q.checkout)) : undefined;
  if (empty) {
    empty.options = [opt];
    if (!empty.name || empty.name === t("stay.new")) empty.name = t("st.itemName", { place: q.place });
    empty.from = q.checkin; empty.to = q.checkout;
    return empty;
  }
  const item: Item = { id: uid(), cat: "stay", name: t("st.itemName", { place: q.place }), status: "idea", from: q.checkin, to: q.checkout, options: [opt] };
  if (part) item.participants = part;
  trip.items.push(item);
  return item;
}

export async function searchStaysRemote(q: StayQuery, signal?: AbortSignal): Promise<StaySearchResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const res = await fetch(`${FLIGHTS_URL}/stays/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 429 ? t("search.tooMany") : data.error || t("search.status", { s: res.status }));
  return data as StaySearchResult;
}
