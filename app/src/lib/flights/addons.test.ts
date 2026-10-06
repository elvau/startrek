import { describe, expect, it } from "vitest";
import { LOW_COST, addOnExtras, addOns, lowCostOf, surchargeBanned } from "./addons";
import { sortFlights } from "./filter";
import type { FlightOffer, OfferLeg } from "./types";

const leg = (carrier: string, from = "DUS", to = "PMI"): OfferLeg => ({ from, to, dep: "2027-08-12T06:00:00", arr: "2027-08-12T08:20:00", minutes: 140, stops: 0, route: [from, to], carriers: [carrier], flights: [] });
const offer = (carrier: string, price: number, baggage?: FlightOffer["baggage"], back = true): FlightOffer =>
  ({ id: carrier + price, source: "x", sourceName: "x", price, currency: "EUR", out: leg(carrier), ...(back ? { back: leg(carrier, "PMI", "DUS") } : {}), ...(baggage ? { baggage } : {}) });
const fam = { bags: 2, adults: 2, kids: 2, together: true };

describe("Flug-Nebenkosten (#171)", () => {
  it("Billigflieger nach Name oder Code", () => {
    expect(lowCostOf("Ryanair")?.id).toBe("ryanair");
    expect(lowCostOf("FR")?.id).toBe("ryanair");
    expect(lowCostOf("Wizz Air Malta")?.id).toBe("wizz");
    expect(lowCostOf("Lufthansa")).toBeUndefined();
  });
  it("Richtwert je Airline: fehlende Koffer je Strecke", () => {
    const a = addOns(offer("Ryanair", 160), { ...fam, kids: 0 });
    expect(a).toMatchObject({ bagFee: 2 * 2 * 40, seatFee: 0, missing: 2, incl: null, carrier: "Ryanair" });
    expect(addOns(offer("easyJet", 160, undefined, false), { ...fam, kids: 0 }).bagFee).toBe(2 * 35);
  });
  it("Koffer laut Anbieter enthalten: nichts dazu; fehlt einer, nur der", () => {
    expect(addOns(offer("Ryanair", 300, { personal: 4, cabin: 0, checked: 2 }), fam).bagFee).toBe(0);
    expect(addOns(offer("Ryanair", 300, { personal: 4, cabin: 0, checked: 1 }), fam).bagFee).toBe(2 * 40);
  });
  it("Linie ohne Angabe: nicht geschätzt; Linie ausdrücklich ohne Koffer: allgemeiner Richtwert", () => {
    expect(addOns(offer("Lufthansa", 300), fam)).toMatchObject({ bagFee: 0, seatFee: 0, incl: null, missing: 0 });
    expect(addOns(offer("Lufthansa", 300, { personal: 4, cabin: 4, checked: 0 }), fam).bagFee).toBe(2 * 2 * 35);
  });
  it("Familie: Platzwahl nur bei Airlines mit Pflicht (Ryanair, Wizz seit 2026 gratis); ein Erwachsener je 4 Kinder, nur wenn zusammen gewünscht", () => {
    expect(addOns(offer("Ryanair", 160), fam).seatFee).toBe(0);
    const paid = LOW_COST.map(l => (l.id === "ryanair" ? { ...l, famSeat: 9 } : l));
    expect(addOns(offer("Ryanair", 160), fam, paid).seatFee).toBe(2 * 9);
    expect(addOns(offer("Ryanair", 160), { ...fam, kids: 5 }, paid).seatFee).toBe(2 * 2 * 9);
    expect(addOns(offer("Ryanair", 160), { ...fam, together: false }, paid).seatFee).toBe(0);
    expect(addOns(offer("easyJet", 160), fam, paid).seatFee).toBe(0);
  });
  it("als Nebenkosten bei Buchung, geschätzt, mit Quelle", () => {
    const paid = LOW_COST.map(l => (l.id === "ryanair" ? { ...l, famSeat: 9 } : l));
    const x = addOnExtras(addOns(offer("Ryanair", 160), fam, paid), { bags: "2 Koffer dazubuchen", seats: "Sitzplätze" });
    expect(x).toEqual([
      expect.objectContaining({ id: "fl:bag", kind: "bag", amount: 160, basis: "booking", pay: "extra", est: true, label: "2 Koffer dazubuchen" }),
      expect.objectContaining({ id: "fl:seat", kind: "seat", amount: 18 })
    ]);
    expect(x[0].source).toMatch(/Ryanair · ryanair\.com.*2026/);
  });
  it("Sortierung mit Gepäck: Billigflieger ohne Koffer rutscht hinter Linie mit Koffer", () => {
    const cheap = offer("Ryanair", 180), line = offer("Lufthansa", 260, { personal: 2, cabin: 2, checked: 2 });
    const rated = [cheap, line].map(o => { const a = addOns(o, { ...fam, kids: 0 }); return { ...o, origin: "DUS", accessHours: 0, total: o.price + a.total }; });
    expect(sortFlights(rated, "price").map(o => o.out.carriers[0])).toEqual(["Lufthansa", "Ryanair"]);
  });
  it("Kartenaufschlag: in EU/EWR und Großbritannien verboten", () => {
    expect(surchargeBanned("DE")).toBe(true);
    expect(surchargeBanned("gb")).toBe(true);
    expect(surchargeBanned("TR")).toBe(false);
    expect(surchargeBanned(undefined)).toBe(true);
  });
});
