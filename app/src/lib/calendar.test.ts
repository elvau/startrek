import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { cancelEvents, icsName, planEvents, toIcs } from "./calendar";
import type { Day } from "./itinerary";

const trip: Trip = { id: "t1", name: "Split mit Familie", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25", tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [{ id: "a", name: "Anna", household: "Klein" }],
  items: [
    { id: "f", cat: "flights", name: "Eurowings", status: "booked", booking: { ref: "ABC123" }, options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 1 },
      legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:05" }] }] },
    { id: "s", cat: "stay", name: "Villa", status: "booked", from: "2027-07-18", to: "2027-07-25", booking: { cancelUntil: "2027-07-01" }, options: [] }
  ] } as Trip;
const days: Day[] = [
  { date: "2027-07-18", n: 1, place: "Split", moved: true, entries: [{ key: "f:0", kind: "flight", text: "DUS → SPU", time: "06:10", order: "06:10" }, { key: "s:in", kind: "stay", text: "Check-in Villa", order: "23:00" }] },
  { date: "2027-07-20", n: 3, place: "Split", moved: false, entries: [{ key: "x", kind: "item", text: "Bootstour", time: "09:30", order: "09:30" }] }
];

describe("Kalender-Export", () => {
  it("Reisezeitraum ganztägig, Flug von Abflug bis Landung in Ortszeit, Einträge mit und ohne Uhrzeit", () => {
    const ev = planEvents(trip, days);
    expect(ev[0]).toMatchObject({ summary: "Split mit Familie", start: "2027-07-18", end: "2027-07-26" });
    expect(ev.find(e => e.uid.startsWith("flight"))).toMatchObject({ start: "2027-07-18T06:10", end: "2027-07-18T08:05", desc: "Eurowings · ABC123" });
    expect(ev.filter(e => e.summary === "DUS → SPU")).toHaveLength(0);
    expect(ev.find(e => e.summary === "Check-in Villa")).toMatchObject({ start: "2027-07-18", end: "2027-07-19" });
    expect(ev.find(e => e.summary === "Bootstour")).toMatchObject({ start: "2027-07-20T09:30" });
  });

  it("Stornofrist als Frist mit Erinnerung am Vortag", () => {
    expect(cancelEvents(trip, n => `Kostenlos stornieren: ${n}`)).toEqual([{ uid: "cancel-s", summary: "Kostenlos stornieren: Villa", start: "2027-07-01", end: "2027-07-02", alarm: 1440 }]);
  });

  it(".ics: ganztägig als DATE, Ortszeit ohne Zeitzone, fester Zeitpunkt in UTC, Sonderzeichen maskiert", () => {
    const ics = toIcs([...planEvents(trip, days), { uid: "sale", summary: "Shibuya Sky; Verkauf, jetzt", at: new Date("2027-02-28T15:00:00Z"), alarm: 15 }], "Split", new Date("2027-01-01T00:00:00Z"));
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("DTSTART;VALUE=DATE:20270718");
    expect(lines).toContain("DTEND;VALUE=DATE:20270726");
    expect(lines).toContain("DTSTART:20270718T061000");
    expect(lines).toContain("DTEND:20270718T080500");
    expect(lines).toContain("DTSTART:20270228T150000Z");
    expect(lines).toContain("SUMMARY:Shibuya Sky\\; Verkauf\\, jetzt");
    expect(lines).toContain("TRIGGER:-PT180M");
    expect(lines.every(l => l.length <= 75)).toBe(true);
    expect(icsName("Split mit Familie")).toBe("split-mit-familie.ics");
  });
});
