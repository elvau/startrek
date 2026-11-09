import { describe, expect, it } from "vitest";
import { clampRange, defaultRange, monthSpan, nextMonths, openStarts, startHouseholds, toSaturday, whenDates, whenPrefs } from "./guided";
import type { Traveler } from "./model";

const home = (ort: string, plz = "", cc = "DE") => ({ cc, plz, ort, lat: 50, lon: 7 });
const tr = (hh: string[]): Traveler[] => hh.map((h, i) => ({ id: `t${i}`, name: `${h} ${i}`, household: h, kind: "adult" }) as Traveler);

describe("Wann (#672)", () => {
  it("erster Samstag und Vorgabe 7 Nächte", () => {
    expect(toSaturday("2027-07-03")).toBe(0);
    expect(toSaturday("2027-07-01")).toBe(2);
    expect(defaultRange("2027-07-01", 31)).toEqual([2, 9]);
    // kurze Ferien: passt nicht ab Samstag, dann so spät wie möglich, höchstens so lang wie die Ferien
    expect(defaultRange("2027-03-22", 5)).toEqual([0, 5]);
    expect(defaultRange("2027-03-22", 12)).toEqual([5, 12]);
  });
  it("Regler bleibt im Bereich, Rückreise nach der Hinreise", () => {
    expect(clampRange(5, 5, 31)).toEqual([5, 6]);
    expect(clampRange(31, 31, 31)).toEqual([30, 31]);
    expect(clampRange(-3, 40, 31)).toEqual([0, 31]);
  });
  it("Monat: Länge und die nächsten zwölf", () => {
    expect(monthSpan("2027-02")).toEqual({ start: "2027-02-01", max: 28 });
    const m = nextMonths("2026-11-03");
    expect(m[0]).toBe("2026-11");
    expect(m[2]).toBe("2027-01");
    expect(m).toHaveLength(12);
  });
  it("Zeitraum aus Tagen, Monat und Ferien", () => {
    expect(whenDates({ mode: "days", from: "2027-07-17", to: "2027-07-24" })).toEqual({ from: "2027-07-17", to: "2027-07-24" });
    expect(whenDates({ mode: "days", from: "2027-07-17", to: "2027-07-10" })).toEqual({ from: "2027-07-17" });
    expect(whenDates({ mode: "month", month: "2027-07" })).toEqual({ from: "2027-07-03", to: "2027-07-10" });
    expect(whenDates({ mode: "month", month: "2027-07", a: 9, b: 20 })).toEqual({ from: "2027-07-10", to: "2027-07-21" });
    expect(whenDates({ mode: "month", month: "2027-07", open: true })).toEqual({});
    expect(whenDates({ mode: "hol", hol: { from: "2027-08-02", to: "2027-09-13" }, a: 5, b: 19 })).toEqual({ from: "2027-08-07", to: "2027-08-21" });
    expect(whenDates({ mode: "flex", flex: "week" })).toEqual({});
    expect(whenDates(undefined)).toEqual({});
  });
  it("offene Tage und flexible Dauer als Vorlieben der Reise", () => {
    expect(whenPrefs({ mode: "month", month: "2027-07", open: true })).toEqual({ months: [7] });
    expect(whenPrefs({ mode: "month", month: "2027-07" })).toEqual({});
    expect(whenPrefs({ mode: "flex", flex: "twoWeeks" })).toEqual({ nightsMin: 10, nightsMax: 15 });
  });
});

describe("Startorte (#672)", () => {
  it("alle vom selben Ort", () => {
    const h = startHouseholds(tr(["Hase", "Hase", "Fuchs"]), { kind: "same", home: home("Köln", "50667") });
    expect(Object.keys(h)).toEqual(["Hase", "Fuchs"]);
    expect(h.Hase).toEqual({ plz: "50667", geo: { lat: 50, lon: 7, ort: "Köln" } });
  });
  it("je Familie, eine offen", () => {
    const h = startHouseholds(tr(["Hase", "Hase", "Fuchs", "Bär"]), { kind: "fams", homes: [home("Köln", "50667"), undefined, home("Wien", "1010", "AT")] });
    expect(h.Hase.geo?.ort).toBe("Köln");
    expect(h.Fuchs).toBeUndefined();
    expect(h["Bär"]).toEqual({ plz: "1010", geo: { lat: 50, lon: 7, ort: "Wien" }, cc: "AT" });
  });
  it("Gruppe in Teilen: Reihenfolge der Personen, Rest offen", () => {
    const t = tr(["A", "B", "C", "D", "E"]);
    const s = { kind: "parts" as const, parts: [{ home: home("Köln"), n: 2 }, { home: home("Hamburg"), n: 2 }] };
    const h = startHouseholds(t, s);
    expect([h.A, h.B, h.C, h.D].map(x => x.geo?.ort)).toEqual(["Köln", "Köln", "Hamburg", "Hamburg"]);
    expect(h.E).toBeUndefined();
    expect(openStarts(s, 5)).toBe(1);
  });
  it("Ferienregion für Haushalte ohne Wohnort", () => {
    const h = startHouseholds(tr(["Hase", "Fuchs"]), { kind: "fams", homes: [home("Köln", "50667")] }, "DE-BY");
    expect(h.Hase.region).toBeUndefined();
    expect(h.Fuchs).toEqual({ region: "DE-BY" });
  });
  it("offen gezählt", () => {
    expect(openStarts({ kind: "same" }, 4)).toBe(4);
    expect(openStarts({ kind: "fams", homes: [undefined, home("Köln")] }, 2)).toBe(1);
  });
});
