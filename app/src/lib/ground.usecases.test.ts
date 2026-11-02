/*
 * Use Cases Bahn, Bus, Auto und Reisebus statt Flug: typische Gruppenreisen ab Deutschland,
 * dazu Invarianten (Preise und Zeiten endlich, nie negativ, mehr Strecke nie billiger oder schneller).
 */
import { describe, expect, it } from "vitest";
import { COACH_MIN, coachCost, fastest, groundPlan, type GroundKind, type GroundPlan, type Spot } from "./ground";

const KOELN: Spot = { name: "Köln", lat: 50.94, lon: 6.96, cc: "DE" };
const MUENCHEN: Spot = { name: "München", lat: 48.14, lon: 11.58, cc: "DE" };
const HAMBURG: Spot = { name: "Hamburg", lat: 53.55, lon: 9.99, cc: "DE" };
const BONN: Spot = { name: "Bonn", lat: 50.737, lon: 7.098, cc: "DE" };
const AMSTERDAM: Spot = { name: "Amsterdam", lat: 52.37, lon: 4.9, cc: "NL" };
const LEVERKUSEN: Spot = { name: "Leverkusen", lat: 51.03, lon: 6.98, cc: "DE" };

const m = (p: GroundPlan, k: GroundKind) => p.modes.find(x => x.k === k);

describe("Use Case: Familienwochenende Köln → München", () => {
  const p = groundPlan(KOELN, MUENCHEN, 4, 3)!;
  it("Bahn, Fernbus und Auto zur Wahl, kein Reisebus für vier", () => {
    expect(p.modes.map(x => x.k)).toEqual(["train", "bus", "car"]);
    expect(p.coach).toBeUndefined();
  });
  it("Auto: ein Wagen, Kilometer geteilt durch vier, hin und zurück", () => {
    const car = m(p, "car")!;
    const pp = (2 * p.road * 0.3) / 4;
    expect(Math.abs(car.lo! - pp)).toBeLessThanOrEqual(2.5);
    expect(car.lo).toBe(car.hi);
  });
  it("Preise in 5-€-Schritten, Spanne nie verkehrt herum", () => {
    for (const x of p.modes) {
      expect(x.lo! % 5).toBe(0);
      expect(x.hi!).toBeGreaterThanOrEqual(x.lo!);
    }
  });
  it("Fernbus günstiger, aber langsamer als die Bahn", () => {
    expect(m(p, "bus")!.lo!).toBeLessThan(m(p, "train")!.lo!);
    expect(m(p, "bus")!.hours).toBeGreaterThan(m(p, "train")!.hours);
  });
  it("Zeiten sind die Summe der Abschnitte, Auto mit Lenkpausen", () => {
    for (const x of p.modes) expect(x.hours).toBeCloseTo(x.parts.reduce((a, q) => a + q.h, 0));
    expect(m(p, "car")!.parts.some(q => q.k === "breaks")).toBe(true);
  });
});

describe("Use Case: Vereinsfahrt mit Reisebus", () => {
  it(`ab ${COACH_MIN} Personen kommt der Reisebus dazu, darunter nicht`, () => {
    expect(groundPlan(KOELN, HAMBURG, COACH_MIN - 1, 3)!.coach).toBeUndefined();
    const p = groundPlan(KOELN, HAMBURG, COACH_MIN, 3)!;
    expect(p.coach).toBeDefined();
    expect(m(p, "coach")).toBeDefined();
  });
  it("Busgröße nach Gruppe: Kleinbus bis 19, Midibus bis 35, Reisebus darüber; ab 51 zwei Busse", () => {
    expect(coachCost(19, 500, 3).size).toBe("mini");
    expect(coachCost(20, 500, 3).size).toBe("midi");
    expect(coachCost(36, 500, 3).size).toBe("full");
    expect(coachCost(50, 500, 3).buses).toBe(1);
    expect(coachCost(51, 500, 3).buses).toBe(2);
  });
  it("Bus bleibt vor Ort bei kurzer Reise, bei langer fährt er als Transfer", () => {
    expect(coachCost(30, 400, 2).stays).toBe(true);
    expect(coachCost(30, 400, 14).stays).toBe(false);
  });
  it("pro Person wird der Reisebus mit der Gruppe günstiger", () => {
    const pp = (n: number) => m(groundPlan(KOELN, HAMBURG, n, 3)!, "coach")!.lo!;
    expect(pp(30)).toBeLessThan(pp(10));
  });
  it("Auto: ab sechs Personen zwei Wagen", () => {
    const five = m(groundPlan(KOELN, MUENCHEN, 5, 3)!, "car")!.lo!;
    const six = m(groundPlan(KOELN, MUENCHEN, 6, 3)!, "car")!.lo!;
    // zwei Autos für sechs: pro Person teurer als ein Auto für fünf
    expect(six).toBeGreaterThan(five);
  });
});

describe("Grenzen des Vergleichs", () => {
  it("Nachbarstadt (unter 30 km): kein Vergleich", () => {
    expect(groundPlan(KOELN, LEVERKUSEN, 4, 2)).toBeNull();
    expect(groundPlan(KOELN, BONN, 4, 2)).toBeNull();
  });
  it("ins Ausland nur bei Auto-Reisen", () => {
    expect(groundPlan(KOELN, AMSTERDAM, 4, 3)).toBeNull();
    expect(groundPlan(KOELN, AMSTERDAM, 4, 3, { road: true })).not.toBeNull();
  });
  it("ohne Ländercode zählt nur die Entfernung", () => {
    const { cc: _, ...ams } = AMSTERDAM;
    expect(groundPlan(KOELN, ams, 4, 3)).not.toBeNull();
  });
  it("null Personen rechnet wie eine, nie durch null geteilt", () => {
    const p = groundPlan(KOELN, MUENCHEN, 0, 3)!;
    expect(p.persons).toBe(1);
    for (const x of p.modes) { expect(Number.isFinite(x.lo)).toBe(true); expect(Number.isFinite(x.hours)).toBe(true); }
  });
});

describe("Invarianten über viele Strecken und Gruppen", () => {
  const dests: Spot[] = [HAMBURG, MUENCHEN, { name: "Berlin", lat: 52.52, lon: 13.4, cc: "DE" }, { name: "Freiburg", lat: 47.99, lon: 7.85, cc: "DE" }, { name: "Dresden", lat: 51.05, lon: 13.74, cc: "DE" }];
  it("Preise und Zeiten endlich und positiv, schnellste Art ist eine der angebotenen", () => {
    for (const d of dests) for (const n of [1, 2, 4, 7, 8, 19, 20, 35, 36, 50, 51, 120]) for (const days of [1, 3, 14]) {
      const p = groundPlan(KOELN, d, n, days)!;
      expect(p).not.toBeNull();
      for (const x of p.modes) {
        expect(x.hours).toBeGreaterThan(0);
        expect(Number.isFinite(x.hours)).toBe(true);
        expect(x.lo!).toBeGreaterThan(0);
        expect(x.hi!).toBeGreaterThanOrEqual(x.lo!);
      }
      expect(p.modes.map(x => x.k)).toContain(fastest(p));
    }
  });
  it("weiter weg ist nie billiger oder schneller (gleiche Gruppe)", () => {
    const near = groundPlan(KOELN, { name: "Frankfurt", lat: 50.11, lon: 8.68, cc: "DE" }, 4, 3)!;
    const far = groundPlan(KOELN, MUENCHEN, 4, 3)!;
    for (const k of ["train", "bus", "car"] as const) {
      expect(m(far, k)!.hours).toBeGreaterThan(m(near, k)!.hours);
      expect(m(far, k)!.lo!).toBeGreaterThanOrEqual(m(near, k)!.lo!);
    }
  });
});
