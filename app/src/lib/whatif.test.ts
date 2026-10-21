import { describe, expect, it } from "vitest";
import { requote, shiftIso, shiftTrip } from "./whatif";
import { offerToOption } from "./flights/app";
import { stayToOption } from "./stays/app";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";
import type { FlightOffer, FlightQuery, OfferLeg } from "./flights/types";
import type { StayOffer, StayQuery } from "./stays/types";

const leg = (from: string, to: string, dep: string, arr: string): OfferLeg => ({ from, to, dep, arr, minutes: 90, stops: 0, route: [from, to], carriers: ["EW"], flights: ["EW1"] });
const flight = (price: number, from = "DUS", out = "2027-05-07", back = "2027-05-10"): FlightOffer => ({
  id: `f${price}${from}${out}`, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR",
  out: leg(from, "PMI", `${out}T08:00:00`, `${out}T10:30:00`), back: leg("PMI", from, `${back}T18:00:00`, `${back}T20:30:00`)
});
const stay = (name: string, total: number): StayOffer => ({ id: name, source: "booking", sourceName: "Booking.com", name, total, currency: "EUR" });

function trip(): Trip {
  const f: Item = { id: "fl", cat: "flights", name: "Flug", status: "chosen", options: [offerToOption(flight(400))] };
  const so = stayToOption(stay("Casa Palma", 600), 2);
  so.query = { place: "Palma", country: "Spanien", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2, childAges: [], rooms: 1 };
  const s: Item = { id: "st", cat: "stay", name: "Unterkunft", status: "idea", from: "2027-05-07", to: "2027-05-10", options: [so] };
  return { id: "t", name: "Palma", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-10",
    travelers: [{ id: "a", name: "A", household: "X" }, { id: "b", name: "B", household: "X" }], items: [f, s], tiers: {}, settings: DEFAULT_SETTINGS };
}

describe("Was wäre wenn (#430)", () => {
  it("verschiebt Reise, Flug und Unterkunft; Abflughafen nur an Hin- und Rückweg", () => {
    expect(shiftIso("2027-05-07T08:00", 31)).toBe("2027-06-07T08:00");
    const tr = trip();
    shiftTrip(tr, { from: "2027-06-07", to: "2027-06-11", airport: "cgn" });
    expect([tr.from, tr.to]).toEqual(["2027-06-07", "2027-06-11"]);
    const legs = tr.items[0].options[0].legs!;
    expect(legs.map(l => [l.dir, l.from, l.to, l.dep.slice(0, 10)])).toEqual([["out", "CGN", "PMI", "2027-06-07"], ["back", "PMI", "CGN", "2027-06-11"]]);
    expect([tr.items[1].from, tr.items[1].to, tr.items[1].options[0].query?.checkin, tr.items[1].options[0].query?.checkout]).toEqual(["2027-06-07", "2027-06-11", "2027-06-07", "2027-06-11"]);
  });
  it("sucht neu: dieselbe Unterkunft bevorzugt, sonst die günstigste; ohne Treffer bleibt der alte Preis", async () => {
    const tr = trip();
    shiftTrip(tr, { from: "2027-06-07", to: "2027-06-10" });
    const asked: { f: FlightQuery[]; s: StayQuery[] } = { f: [], s: [] };
    const r = await requote(tr, {
      flights: async q => { asked.f.push(q); return { offers: [flight(380, "DUS", "2027-06-07", "2027-06-10"), flight(300, "DUS", "2027-06-07", "2027-06-10")], sources: [] }; },
      stays: async q => { asked.s.push(q); return { offers: [stay("Billig", 300), stay("Casa Palma", 700)], sources: [] }; }
    });
    expect(r).toEqual({ done: 2, failed: 0 });
    expect(asked.f[0]).toMatchObject({ depart: "2027-06-07", ret: "2027-06-10" });
    expect(asked.s[0]).toMatchObject({ checkin: "2027-06-07", checkout: "2027-06-10" });
    // gleicher Flug (gleiche Zeiten) zum neuen Preis: beide Angebote passen, das günstigere gewinnt
    expect(tr.items[0].options[0].price.unit).toBe(300);
    expect(tr.items[1].options).toHaveLength(1);
    expect(tr.items[1].options[0].label).toBe("Casa Palma");
    expect(tr.items[1].options[0].price.unit).toBe(700);
    const none = trip();
    const r2 = await requote(none, { flights: async () => ({ offers: [], sources: [] }), stays: async () => { throw new Error("weg"); } });
    expect(r2).toEqual({ done: 0, failed: 2 });
    expect(none.items[0].options[0].price.unit).toBe(400);
  });
});
