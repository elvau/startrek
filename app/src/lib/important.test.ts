import { describe, expect, it } from "vitest";
import { HINTS } from "./hints";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { doneIds, importantPoints, isOpen, isUrgent, markDone, openCount, reopen, type DoneMap } from "./important";
import type { VisaData } from "./visa";
import { MIN_VALID, validUntil } from "./borders";

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
    // gelesen je Person: alle Reisenden
    expect(ps[1].persons!.map(p => p.name)).toEqual(["Anna"]);
  });

  it("gelesen je Person; aufgeklappt nur Dringendes", () => {
    const ps = importantPoints({ trip: trip([anna, ben]), countries: ["US"], hints: HINTS.filter(h => h.id === "machu"), visa,
      advice: { US: { id: "x", name: "USA", warning: false, partial: false, situation: true, situationPart: false } } });
    const done: DoneMap = {};
    const machu = ps.find(p => p.key === "hint:machu")!;
    markDone(done, machu, "a");
    expect(isOpen(machu, done)).toBe(true);
    markDone(done, machu, "b");
    expect(isOpen(machu, done)).toBe(false);
    expect(ps.map(p => `${p.key}:${isUrgent(p)}`)).toEqual(["entry:US:true", "aa:US:false", "hint:machu:false"]);
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

describe("Grenzregeln und Reisepass", () => {
  const th = (travelers: Trip["travelers"]): Trip => ({ ...trip(travelers), place: "Bangkok", country: "Thailand", from: "2027-03-01", to: "2027-03-15" });

  it("Mindestgültigkeit: Thailand 6 Monate ab Einreise, Neuseeland 3 Monate über die Ausreise hinaus", () => {
    expect(validUntil(MIN_VALID.TH, "2027-03-01", "2027-03-15")).toBe("2027-09-01");
    expect(validUntil(MIN_VALID.NZ, "2027-03-01", "2027-03-15")).toBe("2027-06-15");
    expect(validUntil(undefined, "2027-03-01", "2027-03-15")).toBe("2027-03-15");
    const ps = importantPoints({ trip: th([anna]), countries: ["TH"], hints: HINTS.filter(h => h.id === "th"), visa, advice: {} });
    expect(ps.find(p => p.key === "entry:TH")!.valid).toEqual({ months: 6, from: "entry" });
  });

  it("Reisepass läuft zu früh ab: nur mit hinterlegtem Datum, ohne Datum in Schlüssel und Signatur", () => {
    const run = (passports: Record<string, string>) => importantPoints({ trip: th([anna, ben]), countries: ["TH"], hints: [], visa, advice: {}, passports });
    const ps = run({ a: "2027-08-01", b: "2030-01-01" }).filter(p => p.kind === "pass");
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ key: "pass:a", sig: "TH", pass: { expires: "2027-08-01", needed: "2027-09-01" } });
    expect(ps[0].persons!.map(p => p.name)).toEqual(["Anna"]);
    expect(run({}).some(p => p.kind === "pass")).toBe(false);
  });

  it("innerhalb der EU reicht der Ausweis; außerhalb mindestens bis Reiseende", () => {
    const es = { ...trip([anna]), country: "Spanien", from: "2027-03-01", to: "2027-03-15" };
    expect(importantPoints({ trip: es, countries: ["ES"], hints: [], visa, advice: {}, passports: { a: "2027-03-02" } }).some(p => p.kind === "pass")).toBe(false);
    const us = { ...trip([anna]), from: "2027-03-01", to: "2027-03-15" };
    expect(importantPoints({ trip: us, countries: ["US"], hints: [], visa, advice: {}, passports: { a: "2027-03-10" } }).find(p => p.kind === "pass")?.pass).toEqual({ expires: "2027-03-10", needed: "2027-03-15" });
  });

  it("Schengen: EES nur für Pässe von außerhalb der EU", () => {
    const fr = { ...trip([anna, tom, { id: "u", name: "Uma", household: "Lee", nat: "US" }]), country: "Frankreich" };
    const b = importantPoints({ trip: fr, countries: ["FR"], hints: [], visa, advice: {} }).find(p => p.kind === "border")!;
    expect(b.persons!.map(p => p.name)).toEqual(["Tom", "Uma"]);
    expect(isUrgent(b)).toBe(true);
    expect(importantPoints({ trip: { ...fr, travelers: [anna] }, countries: ["FR"], hints: [], visa, advice: {} }).some(p => p.kind === "border")).toBe(false);
  });
});

describe("Mindestgültigkeit für alle Pässe", () => {
  it("Brite nach Thailand: Regel des Ziellands gilt auch für ihn", () => {
    const t: Trip = { ...trip([tom]), country: "Thailand", from: "2027-03-01", to: "2027-03-15" };
    const p = importantPoints({ trip: t, countries: ["TH"], hints: [], visa, advice: {}, passports: { t: "2027-06-01" } }).find(x => x.kind === "pass");
    expect(p?.pass).toEqual({ expires: "2027-06-01", needed: "2027-09-01" });
  });
});
