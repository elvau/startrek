import { describe, expect, it } from "vitest";
import { prefsFromAi, runAgent, systemPrompt, toolsFor } from "./agent";
import { editCount, parseAgentRequest, type AgentRequest } from "./types";
import type { FlightOffer } from "../flights/types";
import type { StayOffer } from "../stays/types";
import type { EventHit, EventQuery } from "../events/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const req: AgentRequest = { prompt: "Coldplay in Wien, zu zweit", lang: "de", today: "2027-04-01", origins: ["DUS"], adults: 2, childAges: [], infants: 0 };
const leg = (from: string, to: string, dep: string, arr: string) => ({ from, to, dep, arr, minutes: 100, stops: 0, route: [from, to], carriers: ["EW"], flights: ["EW1"] });
const flight: FlightOffer = { id: "f1", source: "kiwi", sourceName: "Kiwi.com", price: 300, currency: "EUR", out: leg("DUS", "VIE", "2027-06-13T08:00", "2027-06-13T09:40"), back: leg("VIE", "DUS", "2027-06-15T18:00", "2027-06-15T19:40") };
const stay: StayOffer = { id: "s1", source: "booking", sourceName: "Booking.com", name: "Hotel", total: 250, currency: "EUR", score: 8.4 };
const ev: EventHit = { id: "tm1", source: "ticketmaster", sourceName: "Ticketmaster", name: "Coldplay", start: "2027-06-14T20:00", venue: "Ernst-Happel-Stadion", city: "Wien", cc: "AT", price: { min: 89, currency: "EUR" } };
const old: EventHit = { ...ev, id: "tm0", start: "2027-03-01T20:00" };
const call = (...cs: [string, object][]) => ({ candidates: [{ content: { role: "model", parts: cs.map(([name, args]) => ({ functionCall: { name, args } })) } }] });

function fake(script: object[], withEvents = true) {
  const asked = { events: [] as EventQuery[], bodies: [] as any[] };
  let i = 0;
  return {
    asked,
    deps: {
      gemini: async (body: object) => { asked.bodies.push(JSON.parse(JSON.stringify(body))); return script[Math.min(i++, script.length - 1)]; },
      flights: async () => ({ offers: [flight], sources: [] }),
      stays: async () => ({ offers: [stay], sources: [] }),
      ...(withEvents ? { events: async (q: EventQuery) => { asked.events.push(q); return { events: [old, ev], sources: [] }; } } : {})
    }
  };
}

describe("KI-Kontexte", () => {
  it("Event-Reise: sucht das Event, plant drumherum und hängt nur echte Events an", async () => {
    const f = fake([
      call(["search_events", { keyword: "Coldplay", city: "Vienna", country: "at", from: "2020-01-01" }]),
      call(["search_flights", { from: ["DUS"], to: ["VIE"], depart: "2027-06-13", return: "2027-06-15" }], ["search_stays", { place: "Wien", checkin: "2027-06-13", checkout: "2027-06-15" }]),
      call(["propose_trips", { trips: [{ title: "Coldplay Wien", summary: "x", place: "Wien", from: "2027-06-13", to: "2027-06-15", flightId: "f1", stayId: "s1", eventIds: ["tm1", "erfunden"] }] }])
    ]);
    const res = await runAgent(req, f.deps);
    // Datum in der Vergangenheit wird zu heute, Land in Großbuchstaben, Sprache der App
    expect(f.asked.events[0]).toMatchObject({ q: "Coldplay", city: "Vienna", cc: "AT", from: "2027-04-01", lang: "de" });
    // vergangene Events gehen nicht an die KI
    const shown = f.asked.bodies[1].contents.at(-1).parts[0].functionResponse.response.result.events;
    expect(shown.map((e: any) => e.id)).toEqual(["tm1"]);
    expect(shown[0]).toMatchObject({ priceFrom: 89, venue: "Ernst-Happel-Stadion" });
    expect(res.trips[0].events?.map(e => e.id)).toEqual(["tm1"]);
    expect(res.context).toBe("event");
  });

  it("Vorlieben: nur gültige Felder, Antwort ohne Vorschläge, Kontext Vorlieben", async () => {
    const f = fake([call(["suggest_prefs", { pet: true, bags: false, avoid: ["ru", "XYZ"], minStars: 9, budget: "luxus" }], ["answer", { reply: "Gemerkt!" }])]);
    const res = await runAgent({ ...req, prompt: "Wir haben jetzt einen Hund und reisen nur mit Handgepäck" }, f.deps);
    expect(res).toMatchObject({ trips: [], reply: "Gemerkt!", context: "prefs", prefs: { pet: true, bags: false, avoid: ["RU"] } });
    expect(res.prefs?.minStars).toBeUndefined();
    expect(res.prefs?.budget).toBeUndefined();
  });

  it("Vorlieben neben einer Planung gehen mit den Vorschlägen mit", async () => {
    const f = fake([
      call(["suggest_prefs", { diet: "vegan" }], ["search_flights", { from: ["DUS"], to: ["VIE"], depart: "2027-06-13", return: "2027-06-15" }], ["search_stays", { place: "Wien", checkin: "2027-06-13", checkout: "2027-06-15" }]),
      call(["propose_trips", { trips: [{ title: "Wien", summary: "x", place: "Wien", from: "2027-06-13", to: "2027-06-15", flightId: "f1", stayId: "s1" }] }])
    ], false);
    const res = await runAgent(req, f.deps);
    expect(res.trips).toHaveLength(1);
    expect(res).toMatchObject({ prefs: { diet: "vegan" }, context: "trip" });
    // Werkzeugantwort für suggest_prefs, damit die KI weitermacht
    expect(f.asked.bodies[1].contents.at(-1).parts[0].functionResponse.response.result.ok).toBe(true);
  });

  it("offene Reise: Events als Änderung, zählen mit", async () => {
    const r = { ...req, prompt: "Gibt es da Konzerte?", current: { place: "Wien", from: "2027-06-13", to: "2027-06-15", items: [] } };
    const f = fake([
      call(["search_events", { city: "Wien", from: "2027-06-13", to: "2027-06-15" }]),
      call(["update_trip", { reply: "Coldplay spielt am 14.6.", events: ["tm1", "tm0x"] }])
    ]);
    const res = await runAgent(r, f.deps);
    expect(res.edit?.events?.map(e => e.id)).toEqual(["tm1"]);
    expect(editCount(res.edit!)).toBe(1);
    expect(res.context).toBe("event");
  });

  it("Eventsuche nur, wenn der Such-Dienst sie anbietet; answer nur ohne offene Reise", () => {
    const names = (o: object, e?: boolean) => toolsFor(o as AgentRequest, { events: e })[0].functionDeclarations.map(d => d.name);
    expect(names(req, true)).toEqual(expect.arrayContaining(["search_events", "suggest_prefs", "propose_trips", "answer"]));
    expect(names(req)).not.toContain("search_events");
    expect(names({ ...req, current: { items: [] } }, true)).not.toContain("answer");
  });

  it("gewählter Kontext steht im Systemtext und wird geprüft übernommen", () => {
    expect(systemPrompt({ ...req, focus: "event" })).toMatch(/chose the context: a trip to an event/);
    expect(systemPrompt(req)).not.toMatch(/chose the context/);
    expect((parseAgentRequest({ ...req, focus: "prefs" }) as AgentRequest).focus).toBe("prefs");
    expect((parseAgentRequest({ ...req, focus: "hack" }) as AgentRequest).focus).toBeUndefined();
  });

  it("Vorlieben aus der KI: unbekannte Felder fallen weg", () => {
    expect(prefsFromAi({ foo: 1 })).toBeUndefined();
    expect(prefsFromAi({ styles: ["beach", "moon"], maxStops: 1 })).toEqual({ styles: ["beach"], maxStops: 1 });
  });
});

describe("Vorlieben übernehmen", () => {
  it("gesperrte Länder kommen dazu, andere Werte ersetzen", async () => {
    const { withSuggestion } = await import("./app");
    expect(withSuggestion({ avoid: ["RU"], bags: true, budget: "low" }, { avoid: ["BY", "RU"], bags: false })).toEqual({ avoid: ["RU", "BY"], bags: false, budget: "low" });
    expect(withSuggestion(undefined, { pet: true })).toEqual({ pet: true });
  });
});
