import { describe, expect, it } from "vitest";
import { arrivals, gaps, guestsIn, hints, stations, stayWindow } from "./presence";
import { takeStay } from "./app";
import type { Trip } from "../model";
import type { StayOffer } from "./types";

/** Familie Klein fliegt (landet 08:05, fliegt 16:25 zurück), Familie Hase kommt später mit eigenen Daten */
const trip = (): Trip => ({
  id: "t", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-29",
  travelers: [
    { id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 },
    { id: "c", name: "Cleo", household: "Hase", age: 35 }, { id: "d", name: "Dora", household: "Hase", age: 33 },
    { id: "x", name: "Xaver", household: "Hase", active: false }
  ],
  households: { Hase: { arrive: "2027-07-20", depart: "2027-07-27" } },
  items: [
    { id: "f", cat: "flights", name: "Flug", status: "idea", participants: ["a", "b"], options: [{ id: "o", label: "EW", price: { mode: "unit", currency: "EUR", unit: 900 },
      legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:05" }, { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T16:25", arr: "2027-07-29T18:25" }] }] },
    { id: "s", cat: "stay", name: "Villa", status: "idea", from: "2027-07-18", to: "2027-07-25", options: [{ id: "v", label: "Villa", price: { mode: "unit", currency: "EUR", unit: 1400, basis: "stay" } }] }
  ],
  tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }
});

describe("Unterkunft aus der Anwesenheit", () => {
  it("An- und Abreise je Familie, mit Flugzeiten", () => {
    const a = arrivals(trip());
    expect(a.map(x => [x.who, x.p?.a, x.p?.d, x.arr, x.dep])).toEqual([
      ["Klein", "2027-07-18", "2027-07-29", "2027-07-18T08:05", "2027-07-29T16:25"],
      ["Hase", "2027-07-20", "2027-07-27", undefined, undefined]
    ]);
  });
  it("Hinweise: früh gelandet (Check-in 15 Uhr), spät zurück (Stunden mit Gepäck), sehr früh zurück", () => {
    const [k] = arrivals(trip());
    expect(hints(k)).toEqual(["Ankunft So 18.07. 08:05, Check-in meist erst ab 15 Uhr", "Abflug Do 29.07. 16:25, nach dem Check-out (meist 10 bis 11 Uhr) noch ca. 5 h mit Gepäck"]);
    expect(hints({ ...k, arr: "2027-07-18T16:00", dep: "2027-07-29T06:30" })).toEqual(["Abflug Do 29.07. 06:30, sehr früh: Nacht davor nah am Flughafen?"]);
  });
  it("Zeitraum: erste Ankunft bis letzte Abreise, auch nur für einen Teil", () => {
    expect(stayWindow(trip())).toEqual({ from: "2027-07-18", to: "2027-07-29" });
    expect(stayWindow(trip(), ["c", "d"])).toEqual({ from: "2027-07-20", to: "2027-07-27" });
  });
  it("Gäste im Zeitraum mit ihren Nächten; wer nicht dabei ist, fehlt", () => {
    expect(guestsIn(trip(), "2027-07-18", "2027-07-25").map(g => [g.t.id, g.nights])).toEqual([["a", 7], ["b", 7], ["c", 5], ["d", 5]]);
    expect(guestsIn(trip(), "2027-07-27", "2027-07-29").map(g => g.t.id)).toEqual(["a", "b"]);
  });
  it("Lücken: nach gleichem Zeitraum zusammengefasst, mit Namen der Familie", () => {
    expect(gaps(trip())).toEqual([
      { from: "2027-07-25", to: "2027-07-27", nights: 2, ids: ["c", "d"], who: "Hase" },
      { from: "2027-07-25", to: "2027-07-29", nights: 4, ids: ["a", "b"], who: "Klein", ap: "SPU" }
    ]);
  });
  it("Lücke füllen: neuer Posten nur für die Betroffenen, danach keine Lücke mehr für sie", () => {
    const t = trip();
    const o: StayOffer = { id: "trivago:k", source: "trivago", sourceName: "Trivago", name: "Klara", total: 400, currency: "EUR" };
    const it = takeStay(t, o, { place: "Split", checkin: "2027-07-25", checkout: "2027-07-29", adults: 1, childAges: [9], rooms: 1, type: "all" }, undefined, ["a", "b"]);
    expect(it).toMatchObject({ from: "2027-07-25", to: "2027-07-29", participants: ["a", "b"] });
    expect(gaps(t).map(g => g.who)).toEqual(["Hase"]);
  });

  it("Rundreise (wie Eduard): Stationen Quito, Lima, Rio; Lücken je Stadt, Nacht im Flugzeug zählt nicht", () => {
    const leg = (dir: "out" | "via" | "back", from: string, to: string, dep: string, arr: string, toCity?: string) => ({ dir, from, to, dep, arr, ...(toCity ? { toCity } : {}) });
    const t: Trip = { ...trip(), place: "", travelers: [{ id: "e", name: "Eduard", household: "Klein", age: 40 }], households: {},
      items: [{ id: "r", cat: "flights", name: "Rundreise", status: "idea", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 2175 }, legs: [
        leg("out", "DUS", "UIO", "2027-04-07T06:20", "2027-04-07T16:10", "Quito"),
        leg("via", "UIO", "LIM", "2027-04-14T16:49", "2027-04-14T19:05", "Lima"),
        leg("via", "LIM", "GIG", "2027-04-20T23:25", "2027-04-21T07:00"),
        leg("back", "GIG", "DUS", "2027-04-22T15:35", "2027-04-23T12:25", "Düsseldorf")] }] }] };
    expect(stations(t).map(s => [s.ap, s.city, s.from, s.to])).toEqual([
      ["UIO", "Quito", "2027-04-07", "2027-04-14"], ["LIM", "Lima", "2027-04-14", "2027-04-20"], ["GIG", undefined, "2027-04-21", "2027-04-22"]
    ]);
    // 20.04. im Flugzeug: keine Lücke; drei Lücken, je eine Stadt
    expect(gaps(t).map(g => [g.from, g.to, g.nights, g.ap, g.city])).toEqual([
      ["2027-04-07", "2027-04-14", 7, "UIO", "Quito"], ["2027-04-14", "2027-04-20", 6, "LIM", "Lima"], ["2027-04-21", "2027-04-22", 1, "GIG", undefined]
    ]);
  });
});
