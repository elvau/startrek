import { describe, expect, it } from "vitest";
import { HINTS } from "./hints";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { doneIds, importantPoints, isOpen, markDone, openCount, reopen, type DoneMap } from "./important";
import type { VisaData } from "./visa";

// Ausschnitt aus visa.json: Pässe DE und GB, Ziele US, TH, DE (t = Reisegenehmigung, f90 = 90 Tage visumfrei)
const visa: VisaData = { cc: ["US", "TH", "DE", "GB"], m: { DE: "t,f60,,f180", GB: "t,f60,f90," } };
const trip = (travelers: Trip["travelers"]): Trip => ({ id: "t", name: "USA", place: "New York", country: "USA", tiers: {}, settings: DEFAULT_SETTINGS, travelers, items: [] });
const anna = { id: "a", name: "Anna", household: "Klein" }, ben = { id: "b", name: "Ben", household: "Klein", age: 9 };
const tom = { id: "t", name: "Tom", household: "Smith", nat: "GB" };
const us = HINTS.filter(h => h.id === "us");

describe("Wichtiges zur Reise", () => {
  it("USA: ESTA je Person, Warnstufe des Auswärtigen Amts zuerst", () => {
    const ps = importantPoints({ trip: trip([anna, ben]), countries: ["US"], hints: us, visa, advice: { US: { id: "x", name: "USA", warning: false, partial: false, situation: true, situationPart: false, modified: "2026-09-30" } } });
    expect(ps.map(p => p.key)).toEqual(["entry:US", "aa:US"]);
    expect(ps[0].persons!.map(p => p.name)).toEqual(["Anna", "Ben"]);
    expect(ps[0].hint?.id).toBe("us");
    expect(ps[1]).toMatchObject({ level: "situation", sig: "situation|2026-09-30" });
  });

  it("Reisewarnung vor Einreise, ohne Warnung kein Punkt vom Auswärtigen Amt", () => {
    const adv = (warning: boolean) => ({ US: { id: "x", name: "USA", warning, partial: false, situation: false, situationPart: false } });
    expect(importantPoints({ trip: trip([anna]), countries: ["US"], hints: us, visa, advice: adv(true) }).map(p => p.key)).toEqual(["aa:US", "entry:US"]);
    expect(importantPoints({ trip: trip([anna]), countries: ["US"], hints: us, visa, advice: adv(false) }).map(p => p.key)).toEqual(["entry:US"]);
  });

  it("Pass entscheidet: Brite braucht für die USA auch eine Genehmigung, Deutsche für Thailand nur die Ankunftskarte", () => {
    const ps = importantPoints({ trip: trip([anna, tom]), countries: ["US", "TH"], hints: HINTS.filter(h => h.id === "us" || h.id === "th"), visa, advice: {} });
    expect(ps.find(p => p.key === "entry:US")!.persons!.map(p => p.name)).toEqual(["Anna", "Tom"]);
    // TH: visumfrei für beide, der Hinweis (TDAC) gilt laut Liste nur für deutsche Staatsangehörige
    expect(ps.find(p => p.key === "entry:TH")!.persons!.map(p => p.name)).toEqual(["Anna"]);
  });

  it("Heimatland und Inaktive zählen nicht", () => {
    expect(importantPoints({ trip: trip([anna, { ...ben, active: false }]), countries: ["DE"], hints: [], visa, advice: {} })).toEqual([]);
  });

  it("besondere Orte und Warnungen als eigene Punkte", () => {
    const ps = importantPoints({ trip: trip([anna]), countries: [], hints: HINTS.filter(h => h.id === "machu" || h.id === "kp"), visa, advice: {} });
    expect(ps.map(p => `${p.key}/${p.kind}`)).toEqual(["hint:kp/warn", "hint:machu/place"]);
  });

  it("abhaken je Person, Zähler, wieder öffnen", () => {
    const ps = importantPoints({ trip: trip([anna, ben]), countries: ["US"], hints: us, visa, advice: {} });
    const done: DoneMap = {};
    expect(openCount(ps, done)).toBe(1);
    markDone(done, ps[0], "a");
    expect(doneIds(ps[0], done)).toEqual(["a"]);
    expect(isOpen(ps[0], done)).toBe(true);
    markDone(done, ps[0], "b");
    expect(openCount(ps, done)).toBe(0);
    reopen(done, ps[0], "a");
    expect(doneIds(ps[0], done)).toEqual(["b"]);
    reopen(done, ps[0]);
    expect(done).toEqual({});
  });

  it("ändert sich der Inhalt oder kommt jemand dazu, ist der Punkt wieder offen", () => {
    const adv = (modified: string) => ({ US: { id: "x", name: "USA", warning: true, partial: false, situation: false, situationPart: false, modified } });
    const done: DoneMap = {};
    const [p1] = importantPoints({ trip: trip([anna]), countries: ["US"], hints: [], visa, advice: adv("2026-09-01") });
    markDone(done, p1);
    expect(isOpen(p1, done)).toBe(false);
    const [p2] = importantPoints({ trip: trip([anna]), countries: ["US"], hints: [], visa, advice: adv("2026-10-02") });
    expect(isOpen(p2, done)).toBe(true);
    const e = importantPoints({ trip: trip([anna]), countries: ["US"], hints: us, visa, advice: {} })[0];
    markDone(done, e);
    expect(isOpen(e, done)).toBe(false);
    const e2 = importantPoints({ trip: trip([anna, ben]), countries: ["US"], hints: us, visa, advice: {} })[0];
    expect(isOpen(e2, done)).toBe(true);
    expect(doneIds(e2, done)).toEqual(["a"]);
  });
});
