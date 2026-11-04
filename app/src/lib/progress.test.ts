import { describe, expect, it } from "vitest";
import { homesMissing, progress, WEIGHTS } from "./progress";
import type { Item, Status, Trip } from "./model";

const P = { mode: "unit" as const, currency: "EUR", unit: 100 };
const flight = (status: Status, participants?: string[], dirs: ("out" | "back")[] = ["out", "back"]): Item => ({
  id: "f" + Math.random(), cat: "flights", name: "Flug", status, ...(participants ? { participants } : {}),
  options: [{ id: "o", label: "EW", price: P, legs: dirs.map(d => d === "out"
    ? { dir: "out" as const, from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:05" }
    : { dir: "back" as const, from: "SPU", to: "DUS", dep: "2027-07-25T16:25", arr: "2027-07-25T18:25" }) }]
});
const stay = (status: Status, from = "2027-07-18", to = "2027-07-25"): Item => ({ id: "s" + Math.random(), cat: "stay", name: "Haus", status, from, to, options: [{ id: "v", label: "Haus", price: P }] });
const item = (cat: Item["cat"], status: Status, extra: Partial<Item> = {}): Item => ({ id: cat + Math.random(), cat, name: cat, status, options: [{ id: "x", label: "x", price: P }], ...extra });
const trip = (items: Item[] = [], more: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }, { id: "c", name: "Cleo", household: "Hase", age: 35 }],
  items, tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, ...more
});
const block = (t: Trip, k: string) => progress(t).blocks.find(b => b.k === k)!;

describe("Fortschritt der Reise (#151)", () => {
  it("leere Reise: 0 %, Gewichte zusammen 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const p = progress(trip());
    expect(p.pct).toBe(0);
    expect(p.blocks.map(b => b.w)).toEqual([40, 30, 10, 10, 10]);
  });
  it("nur der Flug, gebucht: nie 100 %, nur der Anteil der Anreise", () => {
    expect(progress(trip([flight("booked")])).pct).toBe(40);
  });
  it("Stand: Gewählt zählt halb, Idee nicht, Verworfen gar nicht", () => {
    expect(progress(trip([flight("chosen")])).pct).toBe(20);
    expect(progress(trip([flight("idea")])).pct).toBe(0);
    expect(progress(trip([flight("dropped")])).pct).toBe(0);
    // Beispiel aus dem Ticket: Flüge gebucht, Unterkunft gewählt = 40 + 15
    expect(progress(trip([flight("booked"), stay("chosen")])).pct).toBe(55);
  });
  it("Teil der Gruppe ohne Flug: anteilig je Person, genannt wird, für wie viele offen", () => {
    const b = block(trip([flight("booked", ["a", "b"])]), "travel");
    expect(b.done).toBeCloseTo(2 / 3);
    expect(b.missing).toEqual({ kind: "persons", open: 1, total: 3 });
  });
  it("nur Hinflug: halbe Anreise", () => {
    expect(block(trip([flight("booked", undefined, ["out"])]), "travel").done).toBe(0.5);
  });
  it("Nächte ohne Bett je Person und Nacht", () => {
    const b = block(trip([stay("booked", "2027-07-18", "2027-07-23")]), "stay");
    // 7 Nächte je Person, 5 abgedeckt
    expect(b.done).toBeCloseTo(5 / 7);
    expect(b.missing).toEqual({ kind: "nights", nights: 2, persons: 3 });
  });
  it("ohne Reisedaten: Unterkunft am Stand der Posten, sonst Hinweis auf den Zeitraum", () => {
    const t = trip([], { from: undefined, to: undefined });
    expect(block(t, "stay").missing).toEqual({ kind: "dates" });
    expect(block(trip([stay("booked")], { from: undefined, to: undefined }), "stay").done).toBe(1);
  });
  it("übrige Bausteine: bester Stand, automatische Posten zählen nicht, Verpflegung als Schätzung", () => {
    expect(block(trip([item("attractions", "idea"), item("attractions", "booked")]), "attractions").done).toBe(1);
    expect(block(trip([item("transport", "chosen", { auto: "local" })]), "transport").done).toBe(0);
    expect(block(trip([], { food: { on: true } }), "misc").done).toBe(0.5);
    expect(block(trip([item("transport", "idea")]), "transport").missing).toEqual({ kind: "idea" });
  });
  it("einfacher Modus: Betrag je Bereich gilt als Schätzung", () => {
    const t = trip([], { detail: { flights: false }, simple: { flights: 600 } });
    expect(block(t, "travel").done).toBe(0.5);
    expect(block(t, "travel").missing).toEqual({ kind: "unbooked" });
  });
  it("„Brauchen wir nicht“: Gewicht geht an die übrigen; Tagesausflug ohne Unterkunft", () => {
    const off = progress(trip([flight("booked")], { progressOff: ["transport", "misc"] }));
    expect(off.blocks.find(b => b.k === "transport")!.off).toBe("user");
    expect(off.pct).toBe(50);
    const day = progress(trip([flight("booked")], { to: "2027-07-18" }));
    expect(day.blocks.find(b => b.k === "stay")!.off).toBe("auto");
    expect(day.pct).toBe(57);
  });
  it("100 % nur, wenn alles abgedeckt ist", () => {
    const all = trip([flight("booked"), stay("paid"), item("transport", "booked"), item("attractions", "booked"), item("misc", "booked")]);
    expect(progress(all).pct).toBe(100);
    all.items[1].status = "chosen";
    expect(progress(all).pct).toBeLessThan(100);
  });
  it("Familien ohne Wohnort", () => {
    expect(homesMissing(trip())).toBe(2);
    expect(homesMissing(trip([], { households: { Klein: { geo: { lat: 1, lon: 1, ort: "Köln" } } } }))).toBe(1);
  });
});
