/* KI-Planer in der App: Anfrage aus der Reise bauen, an den Such-Dienst schicken, Vorschlag übernehmen */
import { i18n, t, type Key } from "../i18n/index.svelte";
import { ageClass } from "../calc";
import { FLIGHTS_URL, flyers, nearestAirports, passengers, takeOffer } from "../flights/app";
import { takeStay } from "../stays/app";
import { idToken } from "../cloud/cloud.svelte";
import { hhKey, uid, type FoodStyle, type Item, type Trip } from "../model";
import { syncFood } from "../food";
import type { GeoData } from "../geo/places";
import { ANIMALS, animalName, nextAnimal, placeholderTravelers } from "../placeholders";
import type { AgentRequest, AgentResult, AgentTrip } from "./types";
import { noteError } from "../bugs/log";

/** Wunsch plus Reisende, Abflughäfen und was über die Reise schon feststeht */
export function agentRequest(trip: Trip, prompt: string, asked = false): AgentRequest {
  const pax = passengers(trip);
  // Kinder mit Alter (ohne Babys auf dem Schoß); ohne Alter: 8
  const childAges = flyers(trip)
    .filter(p => ageClass(p.age, trip.settings, p.kind) !== "adult" && !(p.age != null && (p.age as unknown) !== "" && p.age < 2))
    .map(p => (p.age != null && (p.age as unknown) !== "" ? Math.min(17, Math.max(2, Math.round(Number(p.age)))) : 8))
    .slice(0, pax.children);
  const known = { place: trip.place || undefined, from: trip.from || undefined, to: trip.to || undefined };
  return {
    prompt: prompt.trim(), lang: i18n.lang, today: new Date().toISOString().slice(0, 10),
    origins: nearestAirports(trip, 3), adults: pax.adults, childAges, infants: pax.infants,
    ...(known.place || known.from || known.to ? { trip: known } : {}),
    originsKnown: flyers(trip).some(p => !!trip.households?.[hhKey(p)]?.geo),
    travelersKnown: travelersKnown(trip), asked
  };
}

/** Reisende eingetragen? Eine neue Reise hat nur das Tier vom Start, dann nimmt die KI Anzahl und Alter aus dem Wunsch */
export const travelersKnown = (trip: Trip) => trip.travelers.length > 1 || trip.travelers.some(p => !p.placeholder);

/** Reisende aus dem Vorschlag übernehmen, wenn die Reise noch keine hat: „Fuchs Erw. 1“, „Fuchs Kind 1 (8)“ … */
export function takeParty(trip: Trip, a: AgentTrip) {
  if (!a.party || travelersKnown(trip)) return;
  const animal = trip.travelers[0]?.household ? ANIMALS.find(([n]) => animalName(n) === trip.travelers[0].household)?.[0] : undefined;
  const list = placeholderTravelers([{ animal: animal || nextAnimal(), adults: a.party.adults, kids: a.party.childAges.length, infants: a.party.infants }]);
  let k = 0;
  for (const p of list) if (p.kind === "child") p.age = a.party.childAges[k++];
  trip.travelers = list;
}

/** Meldung des Such-Dienstes in der gewählten Sprache (der Dienst antwortet auf Deutsch) */
export function agentError(status: number, msg?: string): string {
  const k = ({ 400: "ai.err.input", 401: "ai.err.login", 429: "ai.err.limit", 502: "ai.err.busy", 503: "ai.err.setup" } as Record<number, Key>)[status];
  if (k) return t(k);
  return i18n.lang === "de" && msg ? msg : t("search.status", { s: status });
}

export async function askAgent(r: AgentRequest, signal?: AbortSignal): Promise<AgentResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new Error(t("ai.needLogin"));
  const res = await fetch(`${FLIGHTS_URL}/agent`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(r), signal
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    noteError(`KI ${res.status}: ${data.error || "ohne Meldung"}`);
    throw Object.assign(new Error(agentError(res.status, data.error)), { remaining: data.remaining as number | undefined });
  }
  return data as AgentResult;
}

/** Vorschlag übernehmen: Ziel und Daten setzen, Flug und Unterkunft als Posten anlegen */
export function takeAgentTrip(trip: Trip, a: AgentTrip) {
  // erst die Reisenden, damit Flug und Unterkunft für die richtigen Personen gelten
  takeParty(trip, a);
  trip.place = a.place;
  if (a.country) trip.country = a.country;
  trip.from = a.from;
  trip.to = a.to;
  if (trip.autoName !== false) { trip.name = a.title; trip.autoName = false; }
  trip.detail ||= {};
  if (a.flight) { trip.detail.flights = true; takeOffer(trip, a.flight); }
  if (a.stay && a.stayQuery) { trip.detail.stay = true; takeStay(trip, a.stay, a.stayQuery); }
  trip.ai = { at: new Date().toISOString() };
  // Verpflegung passend zur Unterkunft (die Beträge rechnet die App je Land, siehe food.ts)
  trip.food = { ...(trip.food || {}), on: true, style: BOARD_FOOD[a.board || "self"] };
  // Schätzungen der KI als Posten, als Richtwert markiert
  const est = (cat: Item["cat"], name: string, eur: number): Item => ({
    id: uid(), cat, name, status: "idea",
    options: [{ id: uid(), label: "", estimate: true, source: { name: t("ai.estimate") }, price: { mode: "unit", currency: "EUR", unit: eur } }]
  });
  if (a.transport) { trip.detail.transport = true; trip.items.push(est("transport", a.transport.label || t("ai.transport"), a.transport.eur)); }
  if (a.extras?.length) { trip.detail.attractions = true; a.extras.forEach(x => trip.items.push(est("attractions", x.name, x.eur))); }
}

/** Verpflegung laut Unterkunft → Essensstil der App (Frühstück allein: gemischt) */
const BOARD_FOOD: Record<NonNullable<AgentTrip["board"]>, FoodStyle> = { self: "mix", breakfast: "mix", half: "hb", full: "ai", all: "ai" };

/**
 * Vorschlag als fertige Reise, ohne etwas zu speichern: so, wie sie beim Übernehmen entsteht (mit Verpflegung und
 * Anreise zum Flughafen). Für den Gesamtpreis auf der Karte; ohne Orts- und Länderdaten ohne Verpflegung.
 */
export function previewTrip(base: Trip, a: AgentTrip, g?: GeoData): Trip {
  const trip: Trip = JSON.parse(JSON.stringify(base));
  trip.items = [];
  takeAgentTrip(trip, a);
  if (g?.world.length) syncFood(trip, g);
  return trip;
}
