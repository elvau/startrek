import { describe, expect, it } from "vitest";
import { fitTripDates, saneOffer } from "./app";
import { DEFAULT_SETTINGS, type Trip } from "../model";

const L = (dir: "out" | "back", dep: string, arr: string) => ({ dir, from: "A", to: "B", dep, arr });
const fl = (id: string, who: string[] | undefined, a: string, b: string) => ({ id, cat: "flights" as const, name: id, status: "chosen" as const, ...(who ? { participants: who } : {}),
  options: [{ id: id + "o", label: "", price: { mode: "unit" as const, currency: "EUR", unit: 1 }, legs: [L("out", `${a}T10:00`, `${a}T20:00`), L("back", `${b}T10:00`, `${b}T18:00`)] }] });
const trip = (items: Trip["items"]): Trip => ({ id: "t", name: "", place: "", country: "", from: "2027-08-01", to: "2027-08-22", tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [{ id: "a", name: "A", household: "K" }, { id: "b", name: "B", household: "H" }], items });

describe("Reisezeitraum an Flüge", () => {
  it("alle haben Flug: genau Hinflug bis Rückflug", () => {
    const t = trip([fl("f", undefined, "2027-08-20", "2027-09-02")]);
    expect(fitTripDates(t)).toEqual({ from: "2027-08-20", to: "2027-09-02" });
    expect(fitTripDates(t)).toBeNull();
  });
  it("noch nicht alle: nur erweitern", () => {
    const t = trip([fl("f", ["a"], "2027-08-05", "2027-08-25")]);
    expect(fitTripDates(t)).toEqual({ from: "2027-08-01", to: "2027-08-25" });
    const u = trip([fl("f", ["a"], "2027-08-05", "2027-08-20")]);
    expect(fitTripDates(u)).toBeNull();
  });
});

describe("unplausible Flugpreise", () => {
  const o = (price: number, minutes: number) => ({ id: "x", source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR",
    out: { from: "LAX", to: "SAN", dep: "2027-09-03T06:00", arr: "2027-09-03T13:45", minutes, stops: 1, route: ["LAX", "SFO", "SAN"], carriers: ["UA"], flights: [] } });
  it("LAX → SAN für 8.117 € pro Person fällt raus, Langstrecke in Business bleibt", () => {
    expect(saneOffer(o(24352, 465), 3)).toBe(false);
    expect(saneOffer(o(1437, 465), 4)).toBe(true);
    expect(saneOffer(o(6000, 24 * 60), 1)).toBe(true);
  });
});
