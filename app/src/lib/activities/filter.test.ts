import { describe, expect, it } from "vitest";
import { evFacets, evPasses, lenOf, noEvFilter, noTourFilter, partOf, sortTours, tourFacets, tourPasses } from "./filter";
import type { EventHit } from "../events/types";
import type { ActivityHit } from "./types";

const ev = (id: string, start: string, category?: string): EventHit => ({ id, source: "tm", sourceName: "Ticketmaster", name: id, start, ...(category ? { category } : {}) });
const E = [ev("a", "2027-08-12T20:00", "Musik"), ev("b", "2027-08-13T10:30", "Fußball"), ev("c", "2027-08-13T21:00", "Musik"), ev("d", "2027-08-14")];
const to = (id: string, minutes: number, price: number, rating: number, reviews: number): ActivityHit => ({ id, source: "viator", sourceName: "Viator", title: id, minutes, price, rating, reviews, currency: "EUR" });
const T = [to("boot", 180, 60, 4.8, 900), to("stadt", 90, 25, 4.4, 3000), to("insel", 480, 110, 4.9, 120)];

describe("Erlebnisse filtern", () => {
  it("Tageszeit aus der Uhrzeit, ohne Uhrzeit keine", () => {
    expect(["2027-08-12T09:00", "2027-08-12T12:00", "2027-08-12T18:00", "2027-08-12"].map(partOf)).toEqual(["am", "pm", "eve", null]);
  });
  it("Events: Tag, Tageszeit und Art mit Anzahl", () => {
    const fc = evFacets(E, noEvFilter());
    expect(fc.days).toEqual([{ key: "2027-08-12", count: 1 }, { key: "2027-08-13", count: 2 }, { key: "2027-08-14", count: 1 }]);
    expect(fc.parts).toEqual([{ key: "am", count: 1 }, { key: "eve", count: 2 }]);
    expect(fc.cats[0]).toEqual({ key: "Musik", count: 2 });
    expect(E.filter(h => evPasses(h, { ...noEvFilter(), day: "2027-08-13", part: "eve" })).map(h => h.id)).toEqual(["c"]);
    expect(evFacets(E, { ...noEvFilter(), cats: ["Musik"] }).days.map(d => d.count)).toEqual([1, 1]);
  });
  it("Touren: Dauer, Bewertung, Preis pro Person", () => {
    expect([60, 120, 180, 300, 301, undefined].map(lenOf)).toEqual(["short", "short", "half", "half", "day", null]);
    expect(T.filter(a => tourPasses(a, { ...noTourFilter(), len: "half" })).map(a => a.id)).toEqual(["boot"]);
    expect(T.filter(a => tourPasses(a, { ...noTourFilter(), minRating: 4.5, maxPrice: 80 })).map(a => a.id)).toEqual(["boot"]);
    const fc = tourFacets(T, noTourFilter());
    expect(fc.lens).toEqual([{ key: "short", count: 1, min: 25 }, { key: "half", count: 1, min: 60 }, { key: "day", count: 1, min: 110 }]);
    expect(fc.price).toEqual({ lo: 25, hi: 110 });
  });
  it("Touren sortieren", () => {
    expect(sortTours(T, "default").map(a => a.id)).toEqual(["boot", "stadt", "insel"]);
    expect(sortTours(T, "popular").map(a => a.id)).toEqual(["stadt", "boot", "insel"]);
    expect(sortTours(T, "rating")[0].id).toBe("insel");
    expect(sortTours(T, "price")[0].id).toBe("stadt");
    expect(sortTours(T, "short")[0].id).toBe("stadt");
  });
});
