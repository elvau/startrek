import { describe, expect, it } from "vitest";
import { applyStayFilter, kmToCenter, noStayFilter, ppn, stayActive, stayFacets, type StayCtx } from "./filter";
import type { StayOffer } from "./types";

const o = (id: string, total: number, x: Partial<StayOffer> = {}): StayOffer => ({ id, source: "booking", sourceName: "Booking.com", name: id, total, currency: "EUR", ...x });
const L = [
  o("a", 700, { score: 9.4, stars: 3, facts: ["Pool", "Küche"], place: "Split, 0.4 km bis Zentrum", board: "breakfast" }),
  o("b", 400, { score: 7.8, facts: ["Küche"], lat: 43.508, lon: 16.44, source: "trivago" }),
  o("c", 1400, { score: 8.6, stars: 5, facts: ["Pool"], lat: 43.53, lon: 16.30 })
];
const ctx: StayCtx = { nights: 7, people: 2, center: { lat: 43.5081, lon: 16.4402 } };

describe("Unterkunftsfilter", () => {
  it("Preis pro Person und Nacht", () => {
    expect(ppn(L[0], ctx)).toBe(50);
    expect(applyStayFilter(L, { ...noStayFilter(), maxPpn: 50 }, ctx).map(x => x.id)).toEqual(["a", "b"]);
  });
  it("Entfernung: Angabe des Anbieters, sonst aus den Koordinaten", () => {
    expect(kmToCenter(L[0], ctx)).toBe(0.4);
    expect(kmToCenter(L[1], ctx)).toBe(0);
    expect(kmToCenter(L[2], ctx)).toBeGreaterThan(10);
    expect(kmToCenter(L[2], { ...ctx, center: null })).toBeUndefined();
    expect(applyStayFilter(L, { ...noStayFilter(), maxKm: 1 }, ctx).map(x => x.id)).toEqual(["a", "b"]);
  });
  it("Bewertung, Sterne, Ausstattung, Frühstück, Quelle", () => {
    expect(applyStayFilter(L, { ...noStayFilter(), minScore: 8 }, ctx).map(x => x.id)).toEqual(["a", "c"]);
    expect(applyStayFilter(L, { ...noStayFilter(), minStars: 4 }, ctx).map(x => x.id)).toEqual(["c"]);
    expect(applyStayFilter(L, { ...noStayFilter(), facts: ["Pool", "Küche"] }, ctx).map(x => x.id)).toEqual(["a"]);
    expect(applyStayFilter(L, { ...noStayFilter(), breakfast: true }, ctx).map(x => x.id)).toEqual(["a"]);
    expect(applyStayFilter(L, { ...noStayFilter(), sources: ["trivago"] }, ctx).map(x => x.id)).toEqual(["b"]);
    expect(stayActive({ ...noStayFilter(), minScore: 8, facts: ["Pool"] })).toBe(2);
  });
  it("Auswahl mit Anzahl und Preis ab, gerechnet mit den anderen Filtern", () => {
    const fc = stayFacets(L, noStayFilter(), ctx);
    expect(fc.score).toEqual([{ key: 7, count: 3, min: 400 }, { key: 8, count: 2, min: 700 }, { key: 9, count: 1, min: 700 }]);
    expect(fc.facts.map(x => x.key)).toEqual(["Pool", "Küche"]);
    expect(fc.ppn).toEqual({ lo: 25, hi: 100 });
    expect(stayFacets(L, { ...noStayFilter(), facts: ["Pool"] }, ctx).score.map(x => x.count)).toEqual([2, 2, 1]);
  });
});
