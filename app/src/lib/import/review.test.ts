import { describe, expect, it } from "vitest";
import { suggestParty, answer, checks, levelOf, partyOf, reviewOf, setParty } from "./review";
import type { ImportedOffer } from "./ai";

const pkg: ImportedOffer = {
  kind: "package", place: "Playa de Palma", from: "2027-05-10", to: "2027-05-17", adults: 4, price: { total: 796 },
  flights: { legs: [{ dir: "out", from: "DUS", to: "PMI" }] }, stay: { name: "Hotel Sol", board: "breakfast" },
  confidence: { place: 0.98, dates: 0.95, people: 0.9, price: 0.92, flights: 0.85, stay: 0.78, board: 0.72 }
};

describe("Sicherheit je Angabe (#458)", () => {
  it("Stufen: hoch ab 0,85, mittel ab 0,6, ohne Angabe mittel", () => {
    expect([0.98, 0.85, 0.84, 0.6, 0.59, undefined].map(levelOf)).toEqual(["high", "high", "mid", "mid", "low", "mid"]);
  });
  it("Pauschalreise ohne Gepäck und Transfer: zwei Rückfragen, Gesamtwert, nicht direkt", () => {
    const r = reviewOf(pkg);
    expect(r.fields.map(f => `${f.key}:${f.level}`)).toEqual(["place:high", "dates:high", "people:high", "price:high", "flights:high", "stay:mid", "board:mid"]);
    expect(r.questions).toEqual(["baggage", "transfer"]);
    expect(r.overall).toBe(87);
    expect(r.direct).toBe(false);
  });
  it("Antworten: Angabe sicher, Frage weg; „Weiß nicht“ bleibt unsicher, Frage trotzdem beantwortet", () => {
    let o = answer(pkg, "baggage", "cabin");
    expect(o.flights?.baggage).toEqual({ cabin: 1, checked: 0 });
    expect(o.confidence?.baggage).toBe(1);
    o = answer(o, "transfer", "dunno");
    expect(o.transfer).toBeUndefined();
    expect(o.confidence?.transfer).toBe(0.3);
    const r = reviewOf(o, new Set(["baggage", "transfer"]));
    expect(r.questions).toEqual([]);
    expect(r.direct).toBe(false);
    expect(pkg.flights?.baggage).toBeUndefined();
  });
  it("Personen fragen, wenn weder Angebot noch Auswahl sie nennt; Verpflegung, wenn unsicher", () => {
    const o: ImportedOffer = { kind: "stay", place: "Rom", stay: { name: "Casa" }, confidence: { place: 1, stay: 1 } };
    expect(reviewOf(o).questions).toEqual(["people", "board"]);
    expect(reviewOf(o, new Set(), true).questions).toEqual(["board"]);
    const a = answer(answer(o, "people", "3"), "board", "half");
    expect([a.adults, a.stay?.board]).toEqual([3, "half"]);
  });
  it("Personen nur geraten: trotzdem nachfragen, vorbelegt mit dem Vorschlag, sonst 2", () => {
    const o: ImportedOffer = { kind: "stay", place: "Rom", adults: 2, stay: { name: "Casa", board: "half" }, confidence: { place: 1, stay: 1, board: 1, people: 0.5 } };
    expect(reviewOf(o).questions).toEqual(["people"]);
    expect(suggestParty(o)).toEqual({ adults: 2, kids: 0, infants: 0 });
    expect(suggestParty({ kind: "stay", childAges: [6] })).toEqual({ adults: 2, kids: 1, infants: 0 });
    expect(reviewOf(setParty(o, suggestParty(o))).questions).toEqual([]);
  });
  it("alles sicher und nichts offen: direkt anlegen", () => {
    const o: ImportedOffer = { kind: "flight", place: "Rom", adults: 2, flights: { legs: [{ dir: "out", from: "DUS", to: "FCO" }], baggage: { cabin: 1, checked: 0 } }, confidence: { place: 1, people: 1, flights: 0.9, baggage: 0.95 } };
    expect(reviewOf(o).direct).toBe(true);
  });
  it("bitte prüfen: Flug sicher, Unterkunft und Paketpreis abgeleitet", () => {
    expect(checks(answer(answer(pkg, "baggage", "checked"), "transfer", "yes"))).toMatchObject({ flights: false, stay: true, transfer: false });
    expect(checks({ ...pkg, confidence: { ...pkg.confidence, price: 0.5, stay: 1, board: 1 } }).stay).toBe(true);
  });
});

describe("Personen in der Übersicht (#474)", () => {
  it("Erwachsene, Kinder, Kleinkinder bis 2 Jahre aus Alter, Anzahl oder Eingabe", () => {
    expect(partyOf({ kind: "stay", adults: 2, childAges: [1, 5, 8] })).toEqual({ adults: 2, kids: 2, infants: 1 });
    expect(partyOf({ kind: "stay", adults: 2, children: 3 })).toEqual({ adults: 2, kids: 3, infants: 0 });
    const o = setParty({ kind: "stay", adults: 2, childAges: [1, 5, 8] }, { adults: 3, kids: 1, infants: 2 });
    expect(o).toMatchObject({ adults: 3, childAges: [5, 1], children: 3, infants: 2, confidence: { people: 1 } });
    expect(partyOf(o)).toEqual({ adults: 3, kids: 1, infants: 2 });
    const none = setParty(o, { adults: 0, kids: 0, infants: 0 });
    expect(partyOf(none)).toEqual({ adults: 1, kids: 0, infants: 0 });
  });
  it("Flug-Regel (#483): unter 2 Kleinkind, 2–11 Kind, ab 12 zählt als erwachsen", () => {
    expect(partyOf({ kind: "stay", adults: 2, childAges: [1, 2, 11, 12, 15] })).toEqual({ adults: 4, kids: 2, infants: 1 });
  });
});

describe("Kreuzfahrt in der Übersicht (#525)", () => {
  it("Route als eigene Angabe; unsicher → Kreuzfahrt bitte prüfen", () => {
    const o = { kind: "cruise" as const, place: "Kiel", cruise: { ports: [{ place: "Kiel" }, { place: "Oslo" }] }, confidence: { place: 1, cruise: 0.6 } };
    expect(reviewOf(o).fields.map(f => f.key)).toEqual(["place", "cruise"]);
    expect(checks(o)).toMatchObject({ cruise: true, stay: false });
    expect(checks({ ...o, confidence: { place: 1, cruise: 1 } }).cruise).toBe(false);
  });
});
