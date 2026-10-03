import { describe, expect, it } from "vitest";
import { dayRange, itinerary, stations, unplanned } from "./itinerary";
import { DEFAULT_SETTINGS, type Trip } from "./model";

const L = (dir: "out" | "back" | "via", from: string, to: string, dep: string, arr: string) => ({ dir, from, to, dep, arr, carrier: "Sun Air" });
const stay = (id: string, place: string, from: string, to: string) => ({ id, cat: "stay" as const, name: `Unterkunft in ${place}`, status: "idea" as const, from, to,
  options: [{ id: id + "o", label: `Hotel ${place}`, price: { mode: "unit" as const, currency: "EUR", unit: 100 }, query: { place, checkin: from, checkout: to, adults: 2, childAges: [], rooms: 1 } }] });

function trip(): Trip {
  return {
    id: "t", name: "Kroatien", place: "Split", country: "Kroatien", from: "2027-06-05", to: "2027-06-10", tiers: {}, settings: DEFAULT_SETTINGS,
    travelers: [{ id: "a", name: "Anna", household: "Klein" }, { id: "b", name: "Ben", household: "Klein" }],
    items: [
      { id: "f", cat: "flights", name: "Flug", status: "chosen", options: [{ id: "fo", label: "", price: { mode: "unit", currency: "EUR", unit: 400 },
        legs: [L("out", "CGN", "SPU", "2027-06-05T14:30", "2027-06-05T16:30"), L("back", "DBV", "CGN", "2027-06-10T18:00", "2027-06-10T20:20")] }] },
      stay("s1", "Split", "2027-06-05", "2027-06-08"), stay("s2", "Dubrovnik", "2027-06-08", "2027-06-10"),
      { id: "a1", cat: "attractions", name: "Bootstour", status: "idea", day: "2027-06-06T10:00", options: [{ id: "x", label: "", price: { mode: "person", currency: "EUR", adult: 40 } }] },
      { id: "a2", cat: "attractions", name: "Freizeitpark", status: "idea", options: [{ id: "y", label: "", price: { mode: "person", currency: "EUR", adult: 50 } }] }
    ],
    days: { "2027-06-07": { title: "Ruhetag", notes: [{ id: "n1", text: "Strand", kind: "rest" }] }, "2027-06-08": { notes: [{ id: "n2", text: "Bus", kind: "move", time: "09:00", to: "Dubrovnik" }] } }
  };
}

describe("Tagesplan", () => {
  it("Tage vom ersten bis zum letzten Reisetag, sonst aus den Flügen", () => {
    expect(dayRange(trip())).toHaveLength(6);
    expect(dayRange({ ...trip(), from: undefined, to: undefined })).toEqual(["2027-06-05", "2027-06-06", "2027-06-07", "2027-06-08", "2027-06-09", "2027-06-10"]);
    expect(dayRange({ ...trip(), from: undefined, to: undefined, items: [] })).toEqual([]);
  });
  it("Orte je Nacht, Reisetag beim Wechsel, Überschriften", () => {
    const d = itinerary(trip());
    expect(d.map(x => x.place)).toEqual(["Split", "Split", "Split", "Dubrovnik", "Dubrovnik", "Dubrovnik"]);
    expect(d.map(x => x.moved)).toEqual([false, false, false, true, false, false]);
    expect(d[0].auto).toBe("Anreise");
    expect(d[2].title).toBe("Ruhetag");
    expect(d[3].auto).toBe("Weiter nach Dubrovnik");
    expect(d[5].auto).toBe("Rückreise");
  });
  it("Einträge automatisch und eigene, nach Zeit sortiert", () => {
    const d = itinerary(trip());
    expect(d[0].entries.map(e => [e.kind, e.text])).toEqual([["flight", "CGN → SPU"], ["stay", "Check-in Hotel Split"]]);
    expect(d[0].entries[0]).toMatchObject({ time: "14:30", sub: "Landung 16:30 · Sun Air" });
    expect(d[1].entries.map(e => e.text)).toEqual(["Bootstour"]);
    expect(d[3].entries.map(e => [e.kind, e.text, e.sub])).toEqual([["stay", "Check-out Hotel Split", undefined], ["move", "Bus", "→ Dubrovnik"], ["stay", "Check-in Hotel Dubrovnik", undefined]]);
    expect(d[5].entries.map(e => e.text)).toEqual(["Check-out Hotel Dubrovnik", "DBV → CGN"]);
  });
  it("Posten ohne Tag zum Einplanen; Stationen für die Karte", () => {
    expect(unplanned(trip()).map(i => i.name)).toEqual(["Freizeitpark"]);
    expect(stations(itinerary(trip()))).toEqual([{ place: "Split", from: "2027-06-05", nights: 3 }, { place: "Dubrovnik", from: "2027-06-08", nights: 2 }]);
  });
});
