import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Directory, type Item, type Trip } from "../model";
import { parseSetupAi, parseSetupRequest, setupFromGemini, setupPayload } from "./ai";
import { applyAi, applyDraft, draftFrom, licenseBucket, licenseYear, rentalPeople, shouldAutoStart } from "./setup";

const NOW = new Date("2026-10-10T12:00:00Z");

describe("KI-Antwort (#160)", () => {
  it("nur bekannte Felder, Grenzen geprüft", () => {
    const a = parseSetupAi({
      adults: 2, childAges: [6, 9, 30, "x"], license: "gt5", creditCard: true, car: { seats: 5, fuel: "diesel", color: "rot" },
      rail: ["bc50", "halbtax"], styles: ["beach", "golf"], budget: "mid", stayType: "whole", minStars: 7, board: "half",
      airports: ["dus", "Köln", "CGN"], maxStops: 3, bags: true, maxHours: 0, holidays: "NW", months: [8, 7, 13, 7],
      nightsMin: 14, nightsMax: 10, pet: true, stepFree: "ja", diet: "vegan", name: "Alex", gender: "f", nationality: "DE", birth: "1990-01-01"
    });
    expect(a).toEqual({
      adults: 2, childAges: [6, 9], license: "gt5", creditCard: true, car: { seats: 5, fuel: "diesel" }, rail: ["bc50"], styles: ["beach"],
      budget: "mid", stayType: "whole", board: "half", airports: ["DUS", "CGN"], bags: true, holidays: "NW", months: [7, 8],
      nightsMin: 10, nightsMax: 14, pet: true, diet: "vegan"
    });
    expect(parseSetupAi(null)).toEqual({});
    expect(parseSetupAi({ car: { seats: 1 } })).toEqual({});
  });
  it("Werkzeugaufruf aus der Gemini-Antwort", () => {
    const res = { candidates: [{ content: { parts: [{ text: "x" }, { functionCall: { name: "fill_profile", args: { budget: "low", gender: "m" } } }] } }] };
    expect(setupFromGemini(res)).toEqual({ budget: "low" });
    expect(setupFromGemini({})).toEqual({});
  });
  it("Anfrage: nur der Text, gekürzt; ein Werkzeug erzwungen", () => {
    expect(parseSetupRequest({ text: " a " })).toBe("Text fehlt");
    expect(parseSetupRequest({ text: "x".repeat(3000) })).toEqual({ text: "x".repeat(1500) });
    const p = setupPayload("Wir fliegen ab DUS");
    expect(p.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(["fill_profile"]);
    const props = Object.keys((p.tools[0].functionDeclarations[0].parameters as unknown as { properties: object }).properties);
    for (const k of ["name", "gender", "nationality", "birth"]) expect(props).not.toContain(k);
  });
});

describe("Führerschein als ungefähres Jahr", () => {
  it("Stufe ↔ Jahr, wächst mit der Zeit", () => {
    expect(licenseYear("none", NOW)).toBe(0);
    expect(licenseYear("lt1", NOW)).toBe(2026);
    expect(licenseYear("gt5", NOW)).toBe(2021);
    for (const b of ["none", "lt1", "gt1", "gt2", "gt5"] as const) expect(licenseBucket(licenseYear(b, NOW), NOW)).toBe(b);
    expect(licenseBucket(2026, new Date("2028-03-01"))).toBe("gt2");
    expect(licenseBucket(undefined, NOW)).toBeUndefined();
  });
});

describe("Mietwagen aus den Personen", () => {
  const trip = { id: "t", name: "T", place: "", country: "", from: "2027-07-01", to: "2027-07-08", tiers: {}, settings: DEFAULT_SETTINGS, items: [],
    travelers: [{ id: "a", name: "A", household: "K", age: 40, personId: "pa" }, { id: "b", name: "B", household: "K", age: 19, personId: "pb" }, { id: "c", name: "C", household: "K", age: 8, personId: "pc" }] } as unknown as Trip;
  const car = { id: "car", cat: "transport", name: "Mietwagen", icon: "car", status: "idea", options: [] } as unknown as Item;
  it("kein bzw. zu neuer Führerschein, keine Kreditkarte", () => {
    const people = [{ id: "pa", first: "A", last: "K", license: 2015, creditCard: false }, { id: "pb", first: "B", last: "K", license: 2026, creditCard: false }, { id: "pc", first: "C", last: "K", license: 0 }];
    const r = rentalPeople(car, trip, people, NOW);
    expect(r.fresh.map(t => t.name)).toEqual(["B"]);
    expect(r.none).toEqual([]);
    expect(r.noCard).toBe(true);
    const r2 = rentalPeople(car, trip, [{ ...people[0], license: 0, creditCard: true }, people[1]], NOW);
    expect(r2.none.map(t => t.name)).toEqual(["A"]);
    expect(r2.noCard).toBe(false);
    // ohne Angaben keine Hinweise
    expect(rentalPeople(car, trip, [], NOW)).toEqual({ none: [], fresh: [], noCard: false });
  });
});

describe("Entwurf des Assistenten", () => {
  it("füllt nur leere Felder, schreibt ins Verzeichnis, sensible Angaben getrennt", () => {
    const dir: Directory = { people: [], groups: [], prefs: { budget: "high" } };
    const d = draftFrom(dir, undefined, NOW);
    expect(applyAi(d, { budget: "low", styles: ["beach"], adults: 2, childAges: [6], license: "gt2" })).toEqual(["license", "styles", "companions"]);
    expect(d.prefs.budget).toBe("high");
    expect(d.companions).toEqual([{ first: "", age: null, on: true }, { first: "", age: 6, on: true }]);
    Object.assign(d, { first: "Alex", last: "Klein", birth: "1990-06-01", gender: "x", nats: ["DE", "PL"], lgbtq: true, plz: "40210", group: "Familie" });
    d.companions[0].first = "Sam"; d.companions[1].first = "Mia";
    const out = applyDraft(dir, d, NOW);
    expect(out.doc).toEqual({ gender: "x", nats: "DE,PL", lgbtq: "1" });
    const me = dir.people.find(p => p.id === dir.me)!;
    expect(me).toMatchObject({ first: "Alex", last: "Klein", birth: "1990-06-01", license: 2024 });
    expect(JSON.stringify(dir)).not.toContain("DE,PL");
    expect(dir.people.map(p => `${p.first} ${p.last} ${p.age ?? ""}`.trim())).toEqual(["Alex Klein", "Sam Klein", "Mia Klein 6"]);
    expect(dir.groups[0]).toMatchObject({ name: "Familie" });
    expect(dir.groups[0].memberIds).toHaveLength(3);
    expect(dir.prefs).toEqual({ budget: "high", styles: ["beach"], plz: "40210" });
    expect(dir.setup).toBe("2026-10-10");
    // erneut öffnen: steht wieder im Entwurf
    const again = draftFrom(dir, { gender: "x", nats: "DE,PL", lgbtq: "1" }, NOW);
    expect(again).toMatchObject({ first: "Alex", license: "gt2", gender: "x", nats: ["DE", "PL"], lgbtq: true, group: "Familie" });
    expect(again.companions.every(c => c.on)).toBe(true);
  });
  it("startet von selbst nur mit Konto und nur, solange es nicht eingerichtet ist (#330)", () => {
    const used = { people: [{ id: "a", first: "Alex", last: "" }], groups: [] };
    // ohne Konto nie, auch nicht beim allerersten Besuch
    expect(shouldAutoStart({ people: [], groups: [] }, false)).toBe(false);
    // nach dem Ausprobieren (Personen, Reisen) und Anmelden: ja
    expect(shouldAutoStart(used, true)).toBe(true);
    // eingerichtet bzw. „Später“: nicht mehr
    expect(shouldAutoStart({ ...used, setup: "2026-10-10" }, true)).toBe(false);
  });
});
