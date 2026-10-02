import { describe, expect, it } from "vitest";
import { kmText, nearest, tripSpots, type Spot } from "./spots";
import { emptyGeo } from "./places";
import type { Item, Trip } from "../model";

describe("Orte der Reise", () => {
  it("Entfernung als Text", () => {
    expect(kmText(0.43)).toBe("450 m");
    expect(kmText(0.01)).toBe("50 m");
    expect(kmText(2.34)).toBe("2,3 km");
    expect(kmText(14.6)).toBe("15 km");
    expect(kmText(2.34, "en")).toBe("2.3 km");
  });
  it("nächster Ort einer Art", () => {
    const s: Spot[] = [{ id: "a", kind: "event", name: "Fern", lat: 39.7, lon: 2.9 }, { id: "b", kind: "event", name: "Nah", lat: 39.571, lon: 2.651 }, { id: "ap:PMI", kind: "airport", name: "PMI", lat: 39.55, lon: 2.73 }];
    const n = nearest({ lat: 39.57, lon: 2.65 }, s, "event");
    expect(n?.spot.name).toBe("Nah");
    expect(n!.km).toBeLessThan(0.2);
    expect(nearest({ lat: 39.57, lon: 2.65 }, s, "stay")).toBeNull();
  });
  it("Unterkünfte und Erlebnisse mit Ort, Anlass der Reise; ohne Ort und gestrichene nicht", () => {
    const opt = (loc?: { lat: number; lon: number }) => ({ id: "o", label: "X", price: { mode: "unit" as const, currency: "EUR" }, ...(loc ? { loc } : {}) });
    const item = (id: string, cat: Item["cat"], loc?: { lat: number; lon: number }, status: Item["status"] = "idea"): Item => ({ id, cat, name: id, status, options: [opt(loc)] });
    const trip = {
      travelers: [], settings: {}, items: [item("Hotel", "stay", { lat: 39.57, lon: 2.65 }), item("Tour", "attractions", { lat: 39.6, lon: 2.7 }), item("Ohne", "stay"), item("Weg", "attractions", { lat: 1, lon: 1 }, "dropped"), item("Taxi", "transport", { lat: 2, lon: 2 })],
      event: { name: "Konzert", start: "2027-05-15T20:00", lat: 39.58, lon: 2.66 }
    } as unknown as Trip;
    expect(tripSpots(trip, emptyGeo()).map(s => `${s.kind}:${s.name}`)).toEqual(["event:Konzert", "stay:Hotel", "event:Tour"]);
    expect(tripSpots(trip, emptyGeo())[1].itemId).toBe("Hotel");
  });
});
