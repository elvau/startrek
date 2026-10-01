import { describe, expect, it } from "vitest";
import { runAgent, systemPrompt, toolsFor } from "./agent";
import { applyEdit, hasPlan, takeAgentTrip, tripBrief } from "./app";
import { editCount, parseAgentRequest, type AgentRequest } from "./types";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import type { FlightOffer, FlightQuery } from "../flights/types";
import type { StayOffer, StayQuery } from "../stays/types";

const leg = (from: string, to: string, dep: string, arr: string) => ({ from, to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["EW"], flights: ["EW1"] });
const flight = (id: string, price: number): FlightOffer => ({ id, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR", out: leg("DUS", "PMI", "2027-05-10T08:00", "2027-05-10T10:30"), back: leg("PMI", "DUS", "2027-05-13T18:00", "2027-05-13T20:30") });
const stay = (id: string, total: number): StayOffer => ({ id, source: "booking", sourceName: "Booking.com", name: `Hotel ${id}`, total, currency: "EUR", score: 8.5 });
const call = (name: string, args: object) => ({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args } }] } }] });

const trip = (): Trip => ({
  id: "t", name: "Mallorca", place: "Palma", country: "Spanien", from: "2027-05-10", to: "2027-05-13",
  travelers: [{ id: "a", name: "Anna", age: 40, household: "Klein" }, { id: "b", name: "Mia", age: 8, household: "Klein" }],
  items: [
    { id: "fl", cat: "flights", name: "Flug", status: "idea", options: [{ id: "o1", label: "EW", price: { mode: "unit", currency: "EUR", unit: 400 } }] },
    { id: "st", cat: "stay", name: "Hotel alt", status: "chosen", from: "2027-05-10", to: "2027-05-13", options: [{ id: "o2", label: "Hotel alt", price: { mode: "unit", basis: "stay", currency: "EUR", unit: 900 } }] },
    { id: "bk", cat: "transport", name: "Mietwagen", status: "booked", options: [{ id: "o3", label: "", price: { mode: "unit", currency: "EUR", unit: 200 } }] },
    { id: "fw", cat: "flights", name: "Flug Klein (Mia)", status: "idea", follow: "fl", options: [] }
  ],
  tiers: {}, settings: { ...DEFAULT_SETTINGS }
});

const req = (t = trip()): AgentRequest => ({
  prompt: "Günstigeres Hotel und wir fahren mit dem Auto", lang: "de", today: "2027-04-01", origins: ["DUS"], adults: 1, childAges: [8], infants: 0,
  current: tripBrief(t)
});

function fake(script: object[]) {
  const asked: { flights: FlightQuery[]; stays: StayQuery[]; bodies: any[] } = { flights: [], stays: [], bodies: [] };
  let i = 0;
  return {
    asked,
    deps: {
      gemini: async (body: object) => { asked.bodies.push(JSON.parse(JSON.stringify(body))); return script[Math.min(i++, script.length - 1)]; },
      flights: async (q: FlightQuery) => { asked.flights.push(q); return { offers: [flight("f1", 480)], sources: [] }; },
      stays: async (q: StayQuery) => { asked.stays.push(q); return { offers: [stay("s1", 600)], sources: [] }; }
    }
  };
}

describe("KI zur offenen Reise", () => {
  it("fasst die Reise knapp zusammen: ohne Namen der Reisenden, Beträge für alle", () => {
    const b = tripBrief(trip());
    expect(b).toMatchObject({ place: "Palma", from: "2027-05-10", to: "2027-05-13" });
    expect(b.items.map(i => i.id)).toEqual(["fl", "st", "bk", "fw"]);
    expect(b.items[1]).toMatchObject({ cat: "stay", name: "Hotel alt", status: "chosen", eur: 900, detail: "2027-05-10 – 2027-05-13" });
    expect(JSON.stringify(b)).not.toMatch(/Anna|Mia|Klein/);
    expect(b.items[3].name).toBe("Flug … (…)");
    expect(hasPlan(trip())).toBe(true);
    expect(hasPlan({ ...trip(), place: "", items: [] })).toBe(false);
  });

  it("prüft die Reise in der Anfrage", () => {
    const r = parseAgentRequest({ prompt: "Was fehlt noch?", current: { place: "Palma", from: "gestern", items: [{ id: "x", cat: "stay", name: "H", status: "booked", eur: 12.4 }, { id: "bad id!", cat: "stay" }, { id: "y", cat: "zzz" }] } });
    expect(typeof r).toBe("object");
    const c = (r as AgentRequest).current!;
    expect(c).toEqual({ place: "Palma", items: [{ id: "x", cat: "stay", name: "H", status: "booked", eur: 12 }] });
  });

  it("nutzt im Reise-Modus eigene Anweisungen und update_trip statt propose_trips", () => {
    const r = req();
    expect(systemPrompt(r)).toMatch(/has a trip open/);
    const names = toolsFor(r)[0].functionDeclarations.map(f => f.name);
    expect(names).toContain("update_trip");
    expect(names).not.toContain("propose_trips");
  });

  it("sammelt alle Änderungen eines Auftrags; nur echte Angebote, gebuchte Posten bleiben", async () => {
    const f = fake([
      call("search_stays", { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-13" }),
      call("update_trip", {
        reply: "Günstigeres Hotel und Anreise mit dem Auto.",
        stays: [{ offerId: "s1", replaces: "st" }, { offerId: "erfunden" }],
        estimates: [{ cat: "transport", name: "Anreise Auto", eur: 390.4, replaces: "fl" }, { cat: "nix", name: "x", eur: 5 }],
        remove: ["fl", "bk", "fw"],
        from: "2027-05-10", place: "Palma"
      })
    ]);
    const res = await runAgent(req(), f.deps);
    const e = res.edit!;
    expect(res.trips).toEqual([]);
    expect(e.reply).toMatch(/Hotel/);
    expect(e.stays).toHaveLength(1);
    expect(e.stays![0]).toMatchObject({ replaces: "st", offer: { id: "s1" } });
    expect(e.estimates).toEqual([{ cat: "transport", name: "Anreise Auto", eur: 390, replaces: "fl" }]);
    // „fl“ ist schon ersetzt, „bk“ gebucht: bleibt nur „fw“; unveränderte Reisedaten fallen weg
    expect(e.remove).toEqual(["fw"]);
    expect(e.trip).toBeUndefined();
    expect(editCount(e)).toBe(3);
    // letzte Runde erzwingt die Antwort zur Reise
    expect(f.asked.bodies[0].tools[0].functionDeclarations.map((x: any) => x.name)).toContain("update_trip");
  });

  it("beantwortet Fragen ohne Änderungen", async () => {
    const f = fake([call("update_trip", { reply: "Es fehlen noch Transfers." })]);
    const res = await runAgent(req(), f.deps);
    expect(res.edit).toEqual({ reply: "Es fehlen noch Transfers." });
    expect(editCount(res.edit!)).toBe(0);
  });

  it("übernimmt alles auf einmal, ersetzt an derselben Stelle und markiert", () => {
    const t = trip();
    applyEdit(t, {
      reply: "", trip: { to: "2027-05-14" },
      stays: [{ offer: stay("s1", 600), q: { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-14", adults: 1, childAges: [8], rooms: 1, type: "all", currency: "EUR" }, replaces: "st" }],
      flights: [{ offer: flight("f1", 480), replaces: "fl" }],
      estimates: [{ cat: "attractions", name: "Bootstour", eur: 120 }, { cat: "transport", name: "x", eur: 1, replaces: "bk" }],
      remove: ["bk"]
    });
    expect(t.to).toBe("2027-05-14");
    expect(t.items.map(i => i.cat)).toEqual(["flights", "stay", "transport", "flights", "attractions", "transport"]);
    expect(t.items[0].ai?.kind).toBe("changed");
    expect(t.items[1]).toMatchObject({ name: expect.stringContaining("Palma"), ai: { kind: "changed" } });
    // Mitflieger folgen dem neuen Flug
    expect(t.items[3].follow).toBe(t.items[0].id);
    // gebuchter Posten bleibt, die Schätzung dafür wird angehängt statt ersetzt
    expect(t.items[2]).toMatchObject({ id: "bk", status: "booked" });
    expect(t.items[2].ai).toBeUndefined();
    expect(t.items[4].ai?.kind).toBe("created");
    expect(t.items[5].ai?.kind).toBe("created");
    expect(t.ai?.at).toBeTruthy();
  });

  it("große Gruppe: jede Buchung ein eigener Flugposten mit ihren Reisenden", () => {
    const t: Trip = { ...trip(), items: [], travelers: Array.from({ length: 10 }, (_, k) => ({ id: `p${k}`, name: `P${k}`, household: "Team" })) };
    takeAgentTrip(t, {
      title: "Cala Rajada", summary: "", place: "Cala Rajada", from: "2027-05-10", to: "2027-05-13", total: 0, flight: flight("f1", 100),
      bookings: [{ offer: flight("f1", 100), seats: 2, travelers: 6 }, { offer: flight("f2", 900), seats: 9, travelers: 4 }]
    });
    const fl = t.items.filter(i => i.cat === "flights");
    expect(fl).toHaveLength(4);
    expect(fl.map(i => i.participants)).toEqual([["p0", "p1"], ["p2", "p3"], ["p4", "p5"], ["p6", "p7", "p8", "p9"]]);
    expect(fl.map(i => i.options[0].price.unit)).toEqual([100, 100, 100, 400]);
    expect(fl[0].name).toMatch(/\(1\/3\)$/);
    expect(fl.every(i => i.ai?.kind === "suggested")).toBe(true);
  });

  it("Änderung mit aufgeteiltem Flug: erste Buchung ersetzt den alten Flug, die weiteren direkt dahinter", () => {
    const t = trip();
    applyEdit(t, { reply: "", flights: [{ offer: flight("f1", 100), seats: 1, travelers: 2, replaces: "fl" }] });
    expect(t.items.map(i => i.cat)).toEqual(["flights", "flights", "stay", "transport", "flights"]);
    expect(t.items[0].participants).toEqual(["a"]);
    expect(t.items[1].participants).toEqual(["b"]);
    expect(t.items[1].ai?.kind).toBe("changed");
  });
});
