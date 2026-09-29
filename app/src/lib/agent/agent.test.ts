import { describe, expect, it } from "vitest";
import { LIMITS, runAgent } from "./agent";
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
});
