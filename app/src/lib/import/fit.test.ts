import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import type { ImportedOffer } from "./ai";
import { fitOf, offerPeople, offerRange } from "./fit";

const trip = (o: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Kroatien", autoName: false, place: "Split", country: "HR", from: "2027-07-12", to: "2027-07-19",
  travelers: ["a", "b", "c", "d"].map(id => ({ id, name: id, household: id < "c" ? "Berg" : "Yilmaz", kind: "adult" as const })),
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, ...o
});
const offer = (o: Partial<ImportedOffer> = {}): ImportedOffer => ({ kind: "stay", place: "Split", country: "HR", from: "2027-07-12", to: "2027-07-19", adults: 4, stay: { name: "Villa" }, ...o });

describe("Abgleich mit der Reise (#616)", () => {
  it("passt: keine Hinweise", () => {
    expect(fitOf(trip(), offer())).toEqual([]);
  });

  it("Zeitraum daneben, ein Tag Spielraum für Nachtflug und Anreise am Vorabend", () => {
    expect(fitOf(trip(), offer({ from: "2027-07-11", to: "2027-07-20" }))).toEqual([]);
    expect(fitOf(trip(), offer({ from: "2027-08-01", to: "2027-08-08" }))).toEqual([{ k: "dates", offer: "2027-08-01|2027-08-08", trip: "2027-07-12|2027-07-19" }]);
    // Nachzügler: später dazu, innerhalb der Reise
    expect(fitOf(trip(), offer({ from: "2027-07-15", to: "2027-07-19" }))).toEqual([]);
  });

  it("anderes Land", () => {
    expect(fitOf(trip(), offer({ country: "ES" }))).toEqual([{ k: "country", offer: "ES", trip: "HR" }]);
  });

  it("andere Personenzahl, auch je Posten (Mitreisende)", () => {
    expect(fitOf(trip(), offer({ adults: 2 }))).toEqual([{ k: "people", offer: "2", trip: "4" }]);
    expect(fitOf(trip(), offer({ adults: 2 }), ["a", "b"])).toEqual([]);
    expect(fitOf(trip(), offer({ adults: 2, childAges: [5, 8] }))).toEqual([]);
    expect(fitOf(trip({ travelers: [...trip().travelers, { id: "e", name: "e", household: "Yilmaz", kind: "adult", active: false }] }), offer())).toEqual([]);
  });

  it("fehlende Angaben sind keine Abweichung", () => {
    expect(fitOf(trip(), { kind: "stay", stay: { name: "Villa" } })).toEqual([]);
    expect(fitOf(trip({ from: undefined, to: undefined, country: "" }), offer({ from: "2030-01-01", to: "2030-01-05", country: "ES" }))).toEqual([]);
    // neue Reise mit dem Platzhalter vom Start: Personen kommen erst aus dem Angebot
    expect(fitOf(trip({ travelers: [{ id: "p", name: "Reh", household: "Reh", kind: "adult", placeholder: true }] }), offer({ adults: 6 }))).toEqual([]);
  });

  it("Zeitraum aus Flügen bzw. Nächten, Personen aus der Liste", () => {
    expect(offerRange({ kind: "flight", flights: { legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-12T06:00" }, { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-19T20:00" }] } })).toEqual({ from: "2027-07-12", to: "2027-07-19" });
    expect(offerRange({ kind: "stay", from: "2027-07-12", nights: 3 })).toEqual({ from: "2027-07-12", to: "2027-07-15" });
    expect(offerPeople({ kind: "other", travelers: [{ name: "A" }, { name: "B" }, { name: "C" }] })).toBe(3);
    expect(offerPeople({ kind: "other", children: 2 })).toBe(2);
    expect(offerPeople({ kind: "other" })).toBeUndefined();
  });
});
