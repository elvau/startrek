import { describe, expect, it } from "vitest";
import { runAgent, systemPrompt } from "./agent";
import { agentRequest, groupsIn, previewTrip, takeAgentTrip } from "./app";
import { parseAgentRequest, type AgentRequest } from "./types";
import { DEFAULT_SETTINGS, hhKey, type Trip } from "../model";
import { presences, totals } from "../calc";
import type { FlightOffer, FlightQuery } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";

const leg = (from: string, to: string, dep: string, arr: string) => ({ from, to, dep, arr, minutes: 700, stops: 0, route: [from, to], carriers: ["LH"], flights: ["LH1"] });
const flight = (id: string, price: number, out: string, back: string): FlightOffer => ({ id, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR",
  out: leg("FRA", "HND", `${out}T10:00`, `${out}T20:00`), back: leg("HND", "FRA", `${back}T10:00`, `${back}T18:00`) });
const stay = (id: string, total: number): StayOffer => ({ id, source: "booking", sourceName: "Booking.com", name: `Haus ${id}`, total, currency: "EUR", score: 9 });
const call = (name: string, args: object) => ({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args } }] } }] });
const req: AgentRequest = { prompt: "Japan drei Wochen, die anderen nur ab Woche 2, Oma 10 Tage", lang: "de", today: "2027-04-01", origins: ["FRA"], adults: 1, childAges: [], infants: 0 };

function fake(script: object[]) {
  const asked = { flights: [] as FlightQuery[], stays: [] as StayQuery[] };
  let i = 0;
  return { asked, deps: {
    gemini: async () => script[Math.min(i++, script.length - 1)],
    flights: async (q: FlightQuery) => { asked.flights.push(q); return { offers: [flight(`f${asked.flights.length}`, 900 * (q.adults + q.children), q.depart, q.ret!)], sources: [] }; },
    stays: async (q: StayQuery) => { asked.stays.push(q); return { offers: [stay("s1", 6300)], sources: [] }; }
  } };
}

const proposeNew = call("propose_trips", { trips: [{ title: "Japan", summary: "x", place: "Tokio", country: "Japan", from: "2027-07-10", to: "2027-07-31", stayId: "s1",
  flights: [{ flightId: "f1~3", travelers: 3, group: "G1" }, { flightId: "f2~3", travelers: 3, group: "G2" }, { flightId: "f3", travelers: 1, group: "G3" }],
  groups: [
    { key: "G1", label: "Familie 1", adults: 2, childAges: [8], from: "2027-07-10", to: "2027-07-31" },
    { key: "G2", label: "Familie 2", adults: 2, childAges: [5], from: "2027-07-17", to: "2027-07-31" },
    { key: "G3", label: "Oma", adults: 1, childAges: [], from: "2027-07-14", to: "2027-07-24" }
  ] }] });
const searches = [
  call("search_flights", { from: ["FRA"], to: ["HND"], depart: "2027-07-10", return: "2027-07-31", seats: 3 }),
  call("search_flights", { from: ["FRA"], to: ["HND"], depart: "2027-07-17", return: "2027-07-31", seats: 3 }),
  call("search_flights", { from: ["FRA"], to: ["HND"], depart: "2027-07-14", return: "2027-07-24", seats: 1 }),
  call("search_stays", { place: "Tokio", checkin: "2027-07-10", checkout: "2027-07-31", adults: 5, childAges: [8, 5] })
];
const empty = (): Trip => ({ id: "t", name: "Neu", place: "", country: "", tiers: {}, settings: DEFAULT_SETTINGS, travelers: [{ id: "p", name: "Reh", household: "Reh", kind: "adult", placeholder: true }], items: [], detail: {} } as Trip);

describe("KI-Planer: Familien mit eigenen Zeiten (#230)", () => {
  it("Prompt erklärt Familien; bekannte Familien als Kürzel ohne Namen", () => {
    expect(systemPrompt(req)).toMatch(/come and go at different times/);
    const p = systemPrompt({ ...req, groups: [{ key: "F1", adults: 2, childAges: [8], infants: 0 }, { key: "F2", adults: 1, childAges: [], infants: 0, from: "2027-07-14", to: "2027-07-24" }] });
    expect(p).toContain("F1: 2 adult(s), children aged 8; F2: 1 adult(s), own dates 2027-07-14 to 2027-07-24");
  });
  it("neue Familien aus dem Wunsch: Vorschlag mit Familien, Flügen je Familie und Zeitraum vom ersten bis zum letzten Tag", async () => {
    const f = fake([...searches, proposeNew]);
    const res = await runAgent({ ...req, travelersKnown: false }, f.deps);
    const a = res.trips[0];
    expect(a.groups?.map(g => [g.key, g.label, g.adults, g.childAges, g.from, g.to])).toEqual([
      ["G1", "Familie 1", 2, [8], "2027-07-10", "2027-07-31"], ["G2", "Familie 2", 2, [5], "2027-07-17", "2027-07-31"], ["G3", "Oma", 1, [], "2027-07-14", "2027-07-24"]]);
    expect(a.bookings?.map(b => [b.group, b.travelers])).toEqual([["G1", 3], ["G2", 3], ["G3", 1]]);
    expect([a.from, a.to]).toEqual(["2027-07-10", "2027-07-31"]);
    // ohne bekannte Reisende: keine Gruppe als „party“, die Familien gelten
    expect(a.party).toBeUndefined();
  });
  it("Übernahme: Familien mit Zeiten, Flüge je Familie; Unterkunft pro Nacht nach Anwesenden; Vorschau = Übernahme", async () => {
    const f = fake([...searches, proposeNew]);
    const a = (await runAgent({ ...req, travelersKnown: false }, f.deps)).trips[0];
    const t = empty();
    takeAgentTrip(t, a);
    const hhs = [...new Set(t.travelers.map(hhKey))];
    expect(hhs).toEqual(["Familie 1", "Familie 2", "Oma"]);
    expect(t.travelers).toHaveLength(7);
    expect(t.households?.["Familie 1"]?.arrive).toBeUndefined();
    expect(t.households?.["Familie 2"]).toMatchObject({ arrive: "2027-07-17", depart: "2027-07-31" });
    expect(t.households?.Oma).toMatchObject({ arrive: "2027-07-14", depart: "2027-07-24" });
    // Flug der Oma nur für sie
    const oma = t.travelers.find(p => p.household === "Oma")!;
    const fl = t.items.filter(i => i.cat === "flights");
    expect(fl).toHaveLength(3);
    expect(fl.find(i => i.participants?.includes(oma.id))!.participants).toEqual([oma.id]);
    expect(presences(t)[oma.id]).toMatchObject({ a: "2027-07-14", d: "2027-07-24" });
    // Vorschau rechnet mit denselben Personen wie die übernommene Reise
    expect(totals(previewTrip(empty(), a)).total).toBeCloseTo(totals(t).total);
  });
  it("bekannte Familien: Kürzel F1/F2 aus der offenen Reise, Zeiten werden gesetzt, Reisende bleiben (#226)", async () => {
    const base: Trip = { ...empty(), travelers: [
      { id: "a", name: "Anna", household: "Bednorz" }, { id: "b", name: "Ben", household: "Bednorz", age: 8 },
      { id: "o", name: "Inge", household: "Oma" }] } as Trip;
    const r = agentRequest(base, "Japan, Oma nur 10 Tage");
    expect(r.groups).toEqual([{ key: "F1", adults: 1, childAges: [8], infants: 0 }, { key: "F2", adults: 1, childAges: [], infants: 0 }]);
    expect(JSON.stringify(r.groups)).not.toMatch(/Bednorz|Oma|Anna/);
    expect(parseAgentRequest({ ...r }) as AgentRequest).toMatchObject({ groups: r.groups });
    const f = fake([
      call("search_flights", { from: ["FRA"], to: ["HND"], depart: "2027-07-10", return: "2027-07-31", seats: 2 }),
      call("search_flights", { from: ["FRA"], to: ["HND"], depart: "2027-07-14", return: "2027-07-24", seats: 1 }),
      call("search_stays", { place: "Tokio", checkin: "2027-07-10", checkout: "2027-07-31" }),
      call("propose_trips", { trips: [{ title: "Japan", summary: "x", place: "Tokio", from: "2027-07-10", to: "2027-07-31", stayId: "s1",
        flights: [{ flightId: "f1~2", travelers: 2, group: "F1" }, { flightId: "f2~1", travelers: 1, group: "F2" }],
        groups: [{ key: "F1", from: "2027-07-10", to: "2027-07-31" }, { key: "F2", adults: 9, from: "2027-07-14", to: "2027-07-24" }] }] })
    ]);
    const a = (await runAgent(r, f.deps)).trips[0];
    // Personen der bekannten Familien kommen aus der App, nicht von der KI
    expect(a.groups?.find(g => g.key === "F2")?.adults).toBe(1);
    const t: Trip = JSON.parse(JSON.stringify(base));
    takeAgentTrip(t, a);
    expect(t.travelers.map(p => p.id)).toEqual(["a", "b", "o"]);
    expect(t.households?.Oma).toMatchObject({ arrive: "2027-07-14", depart: "2027-07-24" });
    expect(t.items.filter(i => i.cat === "flights").find(i => i.participants?.includes("o"))!.participants).toEqual(["o"]);
    expect(groupsIn(t)[1]).toMatchObject({ key: "F2", from: "2027-07-14", to: "2027-07-24" });
  });
  it("nur eine Familie oder unsinnige Daten: keine Familien im Vorschlag", async () => {
    const f = fake([call("search_stays", { place: "Tokio", checkin: "2027-07-10", checkout: "2027-07-31" }), call("search_flights", { from: ["FRA"], to: ["HND"], depart: "2027-07-10", return: "2027-07-31" }),
      call("propose_trips", { trips: [{ title: "J", summary: "x", place: "Tokio", from: "2027-07-10", to: "2027-07-31", stayId: "s1", flightId: "f1",
        groups: [{ key: "G1", adults: 2, from: "2027-07-10", to: "2027-07-31" }, { key: "G2", adults: 1, from: "2027-07-20", to: "2027-07-12" }] }] })]);
    const a = (await runAgent({ ...req, travelersKnown: false }, f.deps)).trips[0];
    expect(a.groups).toBeUndefined();
  });
});
