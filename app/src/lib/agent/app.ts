/* KI-Planer in der App: Anfrage aus der Reise bauen, an den Such-Dienst schicken, Vorschlag übernehmen */
import { i18n, t } from "../i18n/index.svelte";
import { ageClass } from "../calc";
import { FLIGHTS_URL, flyers, nearestAirports, passengers, takeOffer } from "../flights/app";
import { takeStay } from "../stays/app";
import { idToken } from "../cloud/cloud.svelte";
import type { Trip } from "../model";
import type { AgentRequest, AgentResult, AgentTrip } from "./types";

/** Wunsch plus Reisende, Abflughäfen und was über die Reise schon feststeht */
export function agentRequest(trip: Trip, prompt: string): AgentRequest {
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
    ...(known.place || known.from || known.to ? { trip: known } : {})
  };
}

export async function askAgent(r: AgentRequest, signal?: AbortSignal): Promise<AgentResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new Error(t("ai.needLogin"));
  const res = await fetch(`${FLIGHTS_URL}/agent`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(r), signal
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || t("search.status", { s: res.status })), { remaining: data.remaining as number | undefined });
  return data as AgentResult;
}

/** Vorschlag übernehmen: Ziel und Daten setzen, Flug und Unterkunft als Posten anlegen */
export function takeAgentTrip(trip: Trip, a: AgentTrip) {
  trip.place = a.place;
  if (a.country) trip.country = a.country;
  trip.from = a.from;
  trip.to = a.to;
  if (trip.autoName !== false) { trip.name = a.title; trip.autoName = false; }
  trip.detail ||= {};
  if (a.flight) { trip.detail.flights = true; takeOffer(trip, a.flight); }
  if (a.stay && a.stayQuery) { trip.detail.stay = true; takeStay(trip, a.stay, a.stayQuery); }
}
