import { describe, expect, it } from "vitest";
import { eventWindow, inWindow } from "./window";
import { DEFAULT_SETTINGS, type Trip } from "../model";

const leg = (dir: "out" | "back", from: string, to: string, dep: string, arr: string) => ({ dir, from, to, dep, arr, stops: 0 });
function trip(place = ""): Trip {
  return {
    id: "t", name: "", place, country: "", travelers: [{ id: "a", name: "A", household: "X" }], tiers: {}, settings: DEFAULT_SETTINGS,
    items: [{ id: "f", cat: "flights", name: "Flug", status: "chosen", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 138 },
      legs: [leg("out", "EIN", "PMI", "2026-10-15T10:00", "2026-10-15T12:20"), leg("back", "PMI", "EIN", "2026-10-19T18:00", "2026-10-19T20:20")] }] }]
  };
}

describe("Events vor Ort: Zeitfenster", () => {
  it("Landung + 5 h bis Rückflug − 5 h, Ort von der Reise oder vom Ankunftsflughafen", () => {
    const w = eventWindow(trip(), ap => (ap === "PMI" ? "Palma" : ""));
    expect(w).toMatchObject({ city: "Palma", from: "2026-10-15", to: "2026-10-19", start: "2026-10-15T17:20", end: "2026-10-19T13:00" });
    expect(eventWindow(trip("Sóller, Spanien")).city).toBe("Sóller");
  });
  it("Events davor und danach fallen raus, ganztägige zählen nach Datum", () => {
    const w = eventWindow(trip(), () => "Palma");
    expect(inWindow("2026-10-15T15:00:00", w)).toBe(false);
    expect(inWindow("2026-10-15T20:00:00", w)).toBe(true);
    expect(inWindow("2026-10-19T12:30:00", w)).toBe(true);
    expect(inWindow("2026-10-19T14:00:00", w)).toBe(false);
    expect(inWindow("2026-10-19", w)).toBe(true);
    expect(inWindow("2026-10-20", w)).toBe(false);
  });
  it("ohne Flüge: Reisedaten", () => {
    const t = trip("Palma");
    t.items = [];
    t.from = "2026-10-15"; t.to = "2026-10-18";
    const w = eventWindow(t);
    expect(w).toEqual({ city: "Palma", from: "2026-10-15", to: "2026-10-18" });
    expect(inWindow("2026-10-14T20:00", w)).toBe(false);
    expect(inWindow("2026-10-18T20:00", w)).toBe(true);
  });
});
