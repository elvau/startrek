import { describe, expect, it } from "vitest";
import { LIMITS, runAgent, systemPrompt } from "./agent";
import { parseAgentRequest } from "./types";
import type { AgentRequest } from "./types";
import type { FlightOffer, FlightQuery } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";

const req: AgentRequest = { prompt: "4 Freunde, Mai, Sonne, max 500 €", lang: "de", today: "2027-04-01", origins: ["DUS", "CGN"], adults: 4, childAges: [], infants: 0 };
const leg = (from: string, to: string, dep: string, arr: string) => ({ from, to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["EW"], flights: ["EW1"] });
const flight = (id: string, price: number): FlightOffer => ({ id, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR", out: leg("DUS", "PMI", "2027-05-10T08:00", "2027-05-10T10:30"), back: leg("PMI", "DUS", "2027-05-13T18:00", "2027-05-13T20:30") });
const stay = (id: string, total: number): StayOffer => ({ id, source: "booking", sourceName: "Booking.com", name: `Hotel ${id}`, total, currency: "EUR", score: 8.5 });
const call = (name: string, args: object) => ({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args } }] } }] });

function fake(script: object[]) {
  const asked: { flights: FlightQuery[]; stays: StayQuery[]; bodies: any[] } = { flights: [], stays: [], bodies: [] };
  let i = 0;
  return {
    asked,
    deps: {
      gemini: async (body: object) => { asked.bodies.push(JSON.parse(JSON.stringify(body))); return script[Math.min(i++, script.length - 1)]; },
      flights: async (q: FlightQuery) => { asked.flights.push(q); return { offers: [flight("f1", 480), flight("f2", 520)], sources: [] }; },
      stays: async (q: StayQuery) => { asked.stays.push(q); return { offers: [stay("s1", 600)], sources: [] }; }
    }
  };
}

describe("KI-Reiseplaner", () => {
  it("sucht, schlägt vor und hängt die echten Angebote an", async () => {
    const f = fake([
      call("search_flights", { from: ["dus", "CGN", "FRA", "HAM"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13" }),
      call("search_stays", { place: "Palma", country: "Spain", checkin: "2027-05-10", checkout: "2027-05-13" }),
      call("propose_trips", { trips: [
        { title: "Mallorca", summary: "Sonne", place: "Palma", country: "Spanien", from: "2027-05-10", to: "2027-05-13", flightId: "f1", stayId: "s1" },
        { title: "Erfunden", summary: "x", place: "Nirgendwo", from: "2027-05-10", to: "2027-05-12", flightId: "gibtsnicht" }
      ] })
    ]);
    const res = await runAgent(req, f.deps);
    // erfundene Kennungen fallen raus, Preise stammen aus den Angeboten
    expect(res.trips).toHaveLength(1);
    expect(res.trips[0]).toMatchObject({ title: "Mallorca", place: "Palma", from: "2027-05-10", to: "2027-05-13", total: 1080 });
    expect(res.trips[0].flight?.id).toBe("f1");
    expect(res.trips[0].stayQuery).toMatchObject({ place: "Palma", adults: 4, rooms: 2 });
    // Personen kommen aus der App, nicht von der KI; höchstens 3 Abflughäfen
    expect(f.asked.flights[0]).toMatchObject({ fromAirports: ["DUS", "CGN", "FRA"], toAirports: ["PMI"], adults: 4, children: 0, bags: false });
    // Werkzeugantworten gehen zurück an Gemini
    const second = f.asked.bodies[1].contents;
    expect(second.at(-1).parts[0].functionResponse.response.result.offers[0]).toMatchObject({ id: "f1", price: 480 });
  });

  it("hält die Obergrenze für Suchen ein", async () => {
    const many = Array.from({ length: LIMITS.flights + 2 }, () => call("search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13" }));
    const f = fake([...many, call("propose_trips", { trips: [{ title: "A", summary: "b", place: "Palma", from: "2027-05-10", to: "2027-05-13", flightId: "f2" }] })]);
    const res = await runAgent(req, f.deps);
    expect(f.asked.flights).toHaveLength(LIMITS.flights);
    expect(res.trips[0].total).toBe(520);
  });

  it("letzte Runde erzwingt den Vorschlag, ohne Vorschlag gibt es einen Fehler", async () => {
    const f = fake([call("search_stays", { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-13" })]);
    await expect(runAgent(req, f.deps)).rejects.toThrow(/kein.*Ergebnis/);
    expect(f.asked.bodies).toHaveLength(LIMITS.rounds);
    expect(f.asked.bodies.at(-1).toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(["propose_trips"]);
  });

  it("vergangene Daten und ungültige Eingaben gehen als Fehler an die KI zurück", async () => {
    const f = fake([
      call("search_flights", { from: ["DUS"], to: ["PMI"], depart: "2026-01-10", return: "2026-01-13" }),
      call("propose_trips", { trips: [] })
    ]);
    const res = await runAgent(req, f.deps);
    expect(res.trips).toEqual([]);
    expect(f.asked.flights).toHaveLength(0);
    expect(f.asked.bodies[1].contents.at(-1).parts[0].functionResponse.response.result.error).toMatch(/past/);
  });

  it("Anfrage wird geprüft", () => {
    expect(parseAgentRequest({ prompt: "hi" })).toMatch(/Worten/);
    expect(parseAgentRequest({ prompt: "Wochenende in Rom", adults: 20 })).toMatch(/Personen/);
    const ok = parseAgentRequest({ prompt: "Wochenende in Rom", origins: ["DUS", "xx", "CGN"], lang: "en", adults: 2, childAges: [5], trip: { place: "Rom" } });
    expect(ok).toMatchObject({ origins: ["DUS", "CGN"], lang: "en", childAges: [5], trip: { place: "Rom" } });
  });

  it("fragt einmal nach, wenn Abflugort und Kinderalter fehlen; Rückfrage mit Antworten", async () => {
    const r: AgentRequest = { ...req, prompt: "Eine Woche Strandurlaub mit Kindern", adults: 1, originsKnown: false, travelersKnown: false };
    const f = fake([call("ask_user", { question: "Von wo fliegt ihr los und wie alt sind die Kinder?", options: ["Düsseldorf, 5 und 8", "Köln, 3 und 10", " ", "a", "b", "c"] })]);
    const res = await runAgent(r, f.deps);
    expect(res).toMatchObject({ trips: [], question: "Von wo fliegt ihr los und wie alt sind die Kinder?" });
    expect(res.options).toEqual(["Düsseldorf, 5 und 8", "Köln, 3 und 10", "a", "b"]);
    const names = f.asked.bodies[0].tools[0].functionDeclarations.map((d: any) => d.name);
    expect(names).toContain("ask_user");
    expect(f.asked.bodies[0].systemInstruction.parts[0].text).toContain("home town is unknown");
    expect(f.asked.flights).toHaveLength(0);
  });

  it("nach der Antwort keine zweite Rückfrage: Werkzeug fehlt, eine Rückfrage würde ignoriert", async () => {
    const r: AgentRequest = { ...req, asked: true };
    expect(systemPrompt(r)).toContain("Do not ask again");
    const f = fake([
      call("ask_user", { question: "Noch was?" }),
      call("propose_trips", { trips: [] })
    ]);
    const res = await runAgent(r, f.deps);
    expect(res.question).toBeUndefined();
    expect(f.asked.bodies[0].tools[0].functionDeclarations.map((d: any) => d.name)).not.toContain("ask_user");
  });

  it("Reisende aus der Antwort: Suche und Vorschlag mit 2 Erwachsenen, Kindern 5 und 8 und einem Baby", async () => {
    const r: AgentRequest = { ...req, adults: 1, travelersKnown: false, asked: true };
    const f = fake([
      call("search_flights", { from: ["CGN"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13", adults: 2, childAges: [5, 8, 1] }),
      call("search_stays", { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-13" }),
      call("propose_trips", { trips: [{ title: "Mallorca", summary: "Strand", place: "Palma", from: "2027-05-10", to: "2027-05-13", flightId: "f1", stayId: "s1" }] })
    ]);
    const res = await runAgent(r, f.deps);
    expect(f.asked.flights[0]).toMatchObject({ adults: 2, children: 2, infants: 1 });
    expect(f.asked.stays[0]).toMatchObject({ adults: 2, childAges: [5, 8, 1] });
    expect(res.trips[0].party).toEqual({ adults: 2, childAges: [5, 8], infants: 1 });
  });

  it("eingetragene Reisende bleiben: Angaben der KI zählen dann nicht", async () => {
    const f = fake([
      call("search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13", adults: 9 }),
      call("propose_trips", { trips: [{ title: "x", summary: "y", place: "Palma", from: "2027-05-10", to: "2027-05-13", flightId: "f1" }] })
    ]);
    const res = await runAgent(req, f.deps);
    expect(f.asked.flights[0].adults).toBe(4);
    expect(res.trips[0].party).toBeUndefined();
  });

  it("Vorschlag ohne Unterkunft geht einmal zurück, dann ganze Reise mit Schätzungen", async () => {
    const f = fake([
      call("search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13" }),
      call("propose_trips", { trips: [{ title: "Mallorca", summary: "x", place: "Palma", from: "2027-05-10", to: "2027-05-13", flightId: "f1" }] }),
      call("search_stays", { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-13" }),
      call("propose_trips", { trips: [{ title: "Mallorca", summary: "x", place: "Palma", from: "2027-05-10", to: "2027-05-13", flightId: "f1", stayId: "s1",
        board: "half", transport: { label: "Mietwagen 3 Tage", eur: 120.4 }, extras: [{ name: "Bootstour", eur: 160 }, { name: "", eur: 5 }, { name: "Gratis", eur: 0 }] }] })
    ]);
    const res = await runAgent(req, f.deps);
    // die zweite Gemini-Runde nach dem ersten Vorschlag bekam den Hinweis auf die fehlende Unterkunft
    expect(JSON.stringify(f.asked.bodies[2].contents.at(-1))).toContain("needs a real flight AND a real accommodation");
    expect(res.trips[0]).toMatchObject({ board: "half", transport: { label: "Mietwagen 3 Tage", eur: 120 }, extras: [{ name: "Bootstour", eur: 160 }], stay: { name: "Hotel s1" } });
  });
});
