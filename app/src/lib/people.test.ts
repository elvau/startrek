import { describe, expect, it } from "vitest";
import { ageAt, applyPeople, familyKey, inFamily, lastOfKey } from "./people";
import { DEFAULT_SETTINGS, type Person, type Trip } from "./model";

const people: Person[] = [
  { id: "p1", first: "Anna", last: "Klein", birth: "1985-07-20", home: { plz: "41236", ort: "Mönchengladbach", lat: 51.17, lon: 6.44 } },
  { id: "p2", first: "Ben", last: "Klein", birth: "2019-07-18" },
  { id: "p3", first: "Uwe", last: "Schmitz", age: 50 }
];
const trip = (): Trip => ({
  id: "t", name: "Sommer", place: "", country: "", from: "2027-07-18", to: "2027-07-29",
  travelers: [{ id: "a", name: "Anna", household: "Klein", personId: "p1" }, { id: "b", name: "Ben", household: "Klein", personId: "p2", kind: "child" }, { id: "u", name: "Uwe", household: "Schmitz", personId: "p3", age: 50 }],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
});

describe("Personen in der Reise", () => {
  it("Alter an einem Tag aus dem Geburtsdatum", () => {
    expect(ageAt("2019-07-18", "2027-07-17")).toBe(7);
    expect(ageAt("2019-07-18", "2027-07-18")).toBe(8);
    expect(ageAt("kaputt", "2027-07-18")).toBeNull();
  });
  it("Alter zum Reisebeginn, Wohnort für die Familie; zweites Mal ändert nichts", () => {
    const t = trip();
    expect(applyPeople(t, people)).toBe(true);
    expect(t.travelers.map(x => x.age)).toEqual([41, 8, 50]);
    expect(t.travelers[1].kind).toBeUndefined();
    expect(t.households?.Klein).toEqual({ plz: "41236", geo: { lat: 51.17, lon: 6.44, ort: "Mönchengladbach" } });
    expect(t.households?.Schmitz).toBeUndefined();
    expect(applyPeople(t, people)).toBe(false);
  });
  it("eigener Wohnort der Familie in der Reise bleibt", () => {
    const t = trip();
    t.households = { Klein: { plz: "50667", geo: { lat: 50.94, lon: 6.95, ort: "Köln" } } };
    applyPeople(t, people);
    expect(t.households.Klein.geo?.ort).toBe("Köln");
  });
});

describe("Familie einer gespeicherten Person (#578)", () => {
  const kempen = { plz: "47906", ort: "Kempen", lat: 51.36, lon: 6.42 }, wup = { plz: "42103", ort: "Wuppertal", lat: 51.26, lon: 7.15 };
  const dir: Person[] = [
    { id: "a", first: "Anna", last: "Klein", home: kempen }, { id: "b", first: "Ben", last: "Klein", home: kempen },
    { id: "c", first: "Carla", last: "Klein", home: wup }, { id: "d", first: "Dirk", last: "Klein" },
    { id: "e", first: "Eva", last: "Schmitz", home: kempen }, { id: "f", first: "Finn", last: "Schmitz" }
  ];
  it("gleicher Nachname an verschiedenen Wohnorten: getrennte Familien mit Ort; ohne Wohnort der bloße Nachname", () => {
    expect(dir.map(p => familyKey(p, dir))).toEqual(["Klein (Kempen)", "Klein (Kempen)", "Klein (Wuppertal)", "Klein", "Schmitz", "Schmitz"]);
    expect(familyKey({ id: "x", first: "X", last: " " }, dir)).toBe("");
  });
  it("Zugehörigkeit über den Schlüssel, ältere Reisen über den Nachnamen; Nachname zurück aus dem Schlüssel", () => {
    expect(inFamily(dir[0], "Klein (Kempen)", dir)).toBe(true);
    expect(inFamily(dir[2], "Klein (Kempen)", dir)).toBe(false);
    expect(inFamily(dir[2], "klein", dir)).toBe(true);
    expect(lastOfKey("Klein (Kempen)", "Kempen")).toBe("Klein");
    expect(lastOfKey("Müller (Oma)")).toBe("Müller (Oma)");
  });
});
