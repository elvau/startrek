import { describe, expect, it } from "vitest";
import { acceptFamily, applySelf, declineFamily, famDiff, famProposals, memberState, mergedAvail, parseSelf, selfRows } from "./self";
import type { Trip } from "./model";

const trip = (): Trip => ({
  id: "t", name: "Kegeltour", place: "", country: "", items: [], tiers: {}, settings: {} as Trip["settings"],
  travelers: [
    { id: "m", name: "Markus", household: "Sendler", member: "u-markus" },
    { id: "v", name: "Vanessa", household: "Sendler" },
    { id: "e", name: "Emily", household: "Sendler", age: 7 },
    { id: "l", name: "Lina", household: "Sendler", age: 5 },
    { id: "d", name: "Daniel", household: "Bednorz" }
  ],
  avail: { from: "2027-09-01", to: "2027-09-30", nights: 2, by: { m: { "2027-09-03": "no" }, d: { "2027-09-03": "yes" } } }
});
const claims = { "u-markus": { t: "m", n: "Markus" } };

describe("Selbst eintragen (#571)", () => {
  it("liest nur Erlaubtes aus dem Dokument", () => {
    const s = parseSelf({
      a: { "2027-09-03": "yes", "2027-09-04": "vielleicht", "<img>": "no" },
      h: { plz: "44787", cc: "DE", lat: 51.48, lon: 7.21, ort: "Bochum", region: "DE-NW", evil: "x" },
      f: { m: [{ n: "Vanessa" }, { n: "Gisela", age: 67 }, { n: "" }, { n: "Kind", age: -3, kind: "child" }], at: "2027-01-01T10:00:00Z" },
      rolle: "owner"
    });
    expect(s.a).toEqual({ "2027-09-03": "yes" });
    expect(s.h).toEqual({ plz: "44787", cc: "DE", lat: 51.48, lon: 7.21, ort: "Bochum", region: "DE-NW" });
    expect(s.f?.m).toEqual([{ n: "Vanessa" }, { n: "Gisela", age: 67 }, { n: "Kind", kind: "child" }]);
  });

  it("eigene Zeile gewinnt beim Anzeigen und ist für andere gesperrt; leer heißt: nichts eingetragen", () => {
    const t = trip();
    expect(mergedAvail(t, { "u-markus": { a: { "2027-09-04": "yes" } } }, claims).m).toEqual({ "2027-09-04": "yes" });
    expect(mergedAvail(t, { "u-markus": { a: {} } }, claims).m).toBeUndefined();
    expect(mergedAvail(t, { "u-markus": { h: { ort: "Bochum" } } }, claims).m).toEqual({ "2027-09-03": "no" });
    expect([...selfRows(t, { "u-markus": { a: {} } }, claims)]).toEqual(["m"]);
    expect(mergedAvail(t, { fremd: { a: { "2027-09-04": "yes" } } }, claims).fremd).toBeUndefined();
  });

  it("Planer übernimmt Termine und Wohnort in die Reise, einmal", () => {
    const t = trip();
    const s = { "u-markus": { a: { "2027-09-04": "maybe" as const }, h: { plz: "44787", lat: 51.48, lon: 7.21, ort: "Bochum", region: "DE-NW" } } };
    expect(applySelf(t, s, claims)).toBe(true);
    expect(t.avail!.by.m).toEqual({ "2027-09-04": "maybe" });
    expect(t.households?.Sendler).toMatchObject({ plz: "44787", geo: { lat: 51.48, lon: 7.21, ort: "Bochum" }, region: "DE-NW" });
    expect(applySelf(t, s, claims)).toBe(false);
  });

  it("Familienvorschlag: Zuordnung über Vorname und Alter, Neue dazu, Fehlende nicht dabei", () => {
    const t = trip();
    const me = t.travelers[0];
    const d = famDiff(t, me, [{ n: "vanessa" }, { n: "Emily", age: 8 }, { n: "Gisela", age: 67 }]);
    expect(d.keep.map(k => k.t.id)).toEqual(["v", "e"]);
    expect(d.add.map(m => m.n)).toEqual(["Gisela"]);
    expect(d.drop.map(x => x.id)).toEqual(["l"]);
  });

  it("Vorschlag annehmen ändert die Familie, danach nicht mehr offen; ablehnen bis zum nächsten", () => {
    const t = trip();
    const s = { "u-markus": { f: { m: [{ n: "Vanessa" }, { n: "Emily", age: 8 }, { n: "Gisela", age: 67 }], at: "A" } } };
    const [p] = famProposals(t, s, claims);
    acceptFamily(t, p);
    expect(t.travelers.find(x => x.id === "e")?.age).toBe(8);
    expect(t.travelers.find(x => x.name === "Gisela")).toMatchObject({ household: "Sendler", age: 67 });
    expect(t.travelers.find(x => x.id === "l")?.active).toBe(false);
    expect(famProposals(t, s, claims)).toEqual([]);
    const t2 = trip();
    declineFamily(t2, famProposals(t2, s, claims)[0]);
    expect(famProposals(t2, s, claims)).toEqual([]);
    expect(famProposals(t2, { "u-markus": { f: { ...s["u-markus"].f, at: "B" } } }, claims)).toHaveLength(1);
    // gleiche Familie wie in der Reise: kein Vorschlag
    expect(famProposals(trip(), { "u-markus": { f: { m: [{ n: "Vanessa" }, { n: "Emily", age: 7 }, { n: "Lina", age: 5 }], at: "C" } } }, claims)).toEqual([]);
  });

  it("Stand je Mitglied: Termine, Wohnort, offene Abstimmungen", () => {
    const t = trip();
    t.polls = [{ id: "p1", q: "Wohin?", kind: "free", options: [], votes: {} }, { id: "p2", q: "Zu", kind: "free", options: [], votes: {}, closed: "x" }];
    expect(memberState(t, "u-markus", {}, claims, () => false)).toMatchObject({ dates: true, home: false, polls: 1 });
    expect(memberState(t, "u-markus", { "u-markus": { a: {}, h: { ort: "Bochum" } } }, claims, () => true)).toMatchObject({ dates: false, home: true, polls: 0 });
    expect(memberState(t, "niemand", {}, claims, () => false).who).toBeUndefined();
  });
});

describe("aus dem Konto (#571)", () => {
  it("Familie: gleicher Nachname, ohne einen selbst, Alter zum Stichtag; Wohnort", async () => {
    const { familyFromDir, homeFromDir } = await import("./self");
    const dir = { me: "1", groups: [], prefs: { holidays: "NW" }, people: [
      { id: "1", first: "Markus", last: "Sendler", home: { plz: "44787", ort: "Bochum", lat: 51.48, lon: 7.21 } },
      { id: "2", first: "Vanessa", last: "Sendler" },
      { id: "3", first: "Emily", last: " sendler", birth: "2019-05-01" },
      { id: "4", first: "Timo", last: "Kegler" }
    ] };
    expect(familyFromDir(dir, "2027-09-01")).toEqual([{ n: "Vanessa" }, { n: "Emily", age: 8 }]);
    expect(homeFromDir(dir)).toEqual({ plz: "44787", cc: "DE", lat: 51.48, lon: 7.21, ort: "Bochum", region: "DE-NW" });
    expect(familyFromDir({ people: [], groups: [] }, "2027-09-01")).toEqual([]);
  });
});
