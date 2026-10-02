import { describe, expect, it } from "vitest";
import { hasCoords, itemLoc, locOf, locText, mapsUrl } from "./maps";
import { stayToOption } from "../stays/app";
import { eventItem } from "../activities/app";
import type { Item, Trip } from "../model";

describe("Lage und Google-Maps-Link", () => {
  it("Koordinaten nur, wenn sie gültig sind", () => {
    expect(hasCoords({ lat: 39.57, lon: 2.65 })).toBe(true);
    expect(hasCoords({ lat: 0, lon: 0 })).toBe(false);
    expect(hasCoords({ lat: 120, lon: 2 })).toBe(false);
    expect(hasCoords({ lat: NaN, lon: 2 })).toBe(false);
    expect(hasCoords(undefined)).toBe(false);
  });

  it("Link sucht nach Name und Ort, sonst nach Koordinaten", () => {
    expect(mapsUrl({ q: "Hotel Sol, Palma", lat: 39.5, lon: 2.6 })).toBe("https://www.google.com/maps/search/?api=1&query=Hotel%20Sol%2C%20Palma");
    expect(mapsUrl({ lat: 39.5, lon: 2.6 })).toBe("https://www.google.com/maps/search/?api=1&query=39.500000%2C2.600000");
    expect(mapsUrl({})).toBeUndefined();
    expect(mapsUrl(undefined)).toBeUndefined();
  });

  it("Ort nicht doppelt im Suchtext", () => {
    expect(locText("Hotel Sol", "Palma")).toBe("Hotel Sol, Palma");
    expect(locText("Palma Suites", "Palma, Spanien")).toBe("Palma Suites");
    expect(locText("", "Palma")).toBe("Palma");
  });

  it("Unterkunft aus der Suche bekommt die Lage", () => {
    const o = stayToOption({ id: "b:1", source: "booking", sourceName: "Booking.com", name: "Hotel Sol", total: 500, currency: "EUR", lat: 39.5712345678, lon: 2.6512 }, 2, "Palma");
    expect(o.loc).toEqual({ lat: 39.571235, lon: 2.6512, q: "Hotel Sol, Palma" });
  });

  it("Event: Veranstaltungsort und Stadt", () => {
    const it = eventItem({ id: "e", source: "tm", sourceName: "Ticketmaster", name: "Konzert", start: "2027-05-15T20:00", venue: "Coliseu", city: "Palma", lat: 39.58, lon: 2.66 });
    expect(it.options[0].loc).toEqual({ lat: 39.58, lon: 2.66, q: "Coliseu, Palma" });
    const none = eventItem({ id: "e2", source: "tm", sourceName: "Ticketmaster", name: "X", start: "2027-05-15" });
    expect(none.options[0].loc).toBeUndefined();
  });

  it("ältere Unterkunft ohne gespeicherte Lage: Name und Ort der Suche", () => {
    const trip = { place: "Mallorca" } as Trip;
    const item = { cat: "stay", options: [] } as unknown as Item;
    expect(itemLoc(item, { id: "o", label: "Finca Luna", price: { mode: "unit" }, query: { place: "Pollença", checkin: "", checkout: "", adults: 2, childAges: [], rooms: 1 } }, trip)).toEqual({ q: "Finca Luna, Pollença" });
    expect(itemLoc({ ...item, cat: "misc" } as Item, { id: "o", label: "Taxi", price: { mode: "unit" } }, trip)).toBeUndefined();
  });
});
