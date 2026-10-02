import { describe, expect, it } from "vitest";
import { BOOKING_SIZE, offerToOption, scaleResult, splitPax } from "./flights/app";
import { autoParts, autoRooms, splitGuests, stayToOption } from "./stays/app";
import { calcItem } from "./calc";
import { flightQueryFor } from "./watch";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";
import type { FlightOffer, SearchResult } from "./flights/types";

const trip = (n: number): Trip => ({ id: "t", name: "", place: "Palma", country: "Spanien", tiers: {}, settings: DEFAULT_SETTINGS, items: [],
  travelers: Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i, household: "Club" })) });
const leg = { from: "DUS", to: "PMI", dep: "2027-05-13T08:00:00", arr: "2027-05-13T10:30:00", minutes: 150, stops: 0, route: ["DUS", "PMI"], carriers: ["Sun Air"], flights: ["SA1"] };
const offer = (price: number): FlightOffer => ({ id: "x", source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR", out: leg });

describe("Flüge für große Gruppen aufteilen", () => {
  it("15 Erwachsene in 3 Buchungen à 5, Preis × 3", () => {
    const s = splitPax({ adults: 15, children: 0, infants: 0 }, BOOKING_SIZE);
    expect(s).toEqual({ q: { adults: 5, children: 0, infants: 0 }, bookings: 3, size: 5, factor: 3 });
  });
  it("Kinder und Babys anteilig, nie mehr Babys als Erwachsene", () => {
    const s = splitPax({ adults: 10, children: 5, infants: 2 }, 5);
    expect(s.bookings).toBe(3);
    expect(s.q).toEqual({ adults: 4, children: 1, infants: 1 });
    expect(s.factor).toBeCloseTo(17 / 6);
  });
  it("kleine Gruppe oder größer als die Gruppe: nicht aufteilen", () => {
    expect(splitPax({ adults: 4, children: 0, infants: 0 }, 9)).toMatchObject({ bookings: 1, factor: 1 });
    // Anbieter suchen höchstens 9
    expect(splitPax({ adults: 12, children: 0, infants: 0 }, 20)).toMatchObject({ bookings: 2, size: 6 });
  });
  it("Preise hochrechnen, Angebot merkt sich die Buchungsgröße", () => {
    const r: SearchResult = { offers: [{ ...offer(500), orig: { amount: 2000, currency: "PLN" } }], sources: [] };
    const s = scaleResult(r, 3).offers[0];
    expect(s.price).toBe(1500);
    expect(s.orig?.amount).toBe(6000);
    expect(scaleResult(r, 1)).toBe(r);
    const opt = offerToOption(s, { size: 5, note: "hochgerechnet: 3 Buchungen à 5" });
    expect(opt).toMatchObject({ split: 5, price: { unit: 1500 } });
    expect(opt.detail).toContain("3 Buchungen à 5");
  });
  it("Preisprüfung sucht wieder für eine Buchung", () => {
    const t = trip(15);
    const opt = offerToOption(offer(1500), { size: 5, note: "" });
    opt.legs = [{ dir: "out", from: "DUS", to: "PMI", dep: "2027-05-13T08:00", arr: "2027-05-13T10:30" }];
    const it: Item = { id: "f", cat: "flights", name: "Flug", status: "idea", options: [opt] };
    expect(flightQueryFor(t, it, opt)).toMatchObject({ adults: 5, children: 0 });
    delete opt.split;
    expect(flightQueryFor(t, it, opt)).toMatchObject({ adults: 15 });
  });
});

describe("Unterkünfte für große Gruppen", () => {
  it("ab 11 Gästen aufteilen (je bis 8), auch Hotels (Anbieter liefern für mehr kaum etwas)", () => {
    expect(autoParts(10, "whole")).toBe(1);
    expect(autoParts(15, "whole")).toBe(2);
    expect(autoParts(25, "all")).toBe(4);
    expect(autoParts(15, "hotel")).toBe(2);
  });
  it("Zimmer: ganze Unterkunft eins, sonst je zwei Gäste eins", () => {
    expect(autoRooms(15, "whole")).toBe(1);
    expect(autoRooms(15, "hotel")).toBe(8);
    expect(autoRooms(80, "all")).toBe(30);
  });
  it("Gäste der größten Unterkunft", () => {
    expect(splitGuests({ adults: 15, childAges: [] }, 2)).toEqual({ adults: 8, childAges: [] });
    expect(splitGuests({ adults: 6, childAges: [3, 8, 12] }, 2)).toEqual({ adults: 3, childAges: [3, 12] });
    const g = { adults: 4, childAges: [5] };
    expect(splitGuests(g, 1)).toBe(g);
  });
  it("übernommen: Preis je Unterkunft, gebucht so viele wie nötig", () => {
    const t = trip(15);
    const opt = stayToOption({ id: "s", source: "booking", sourceName: "Booking.com", name: "Finca", total: 1200, currency: "EUR", place: "Cala Rajada" }, 8, "Cala Rajada", 2);
    expect(opt).toMatchObject({ split: 2, price: { unit: 1200, capacity: 8, multiply: true } });
    expect(opt.detail).toContain("Cala Rajada");
    const it: Item = { id: "st", cat: "stay", name: "Finca", status: "idea", options: [opt] };
    expect(calcItem(it, t).net).toBe(2400);
  });
});
