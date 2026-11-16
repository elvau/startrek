import { describe, expect, it } from "vitest";
import { along, splitLeg, STOP_PER_PERSON } from "./split";
import type { Etappe } from "./trip";
import type { Item, Trip } from "../model";
import type { LL } from "./ors";

/* Lange Etappe teilen (#201): Punkt an der Strecke, Zwischenstopps als Unterkunft, Ankunft bzw. Reiseende verschieben sich. */

// gerade Strecke nach Osten auf dem Äquator: gleiche Abstände, leicht nachzurechnen
const PATH: LL[] = [[0, 0], [0, 1], [0, 3]];
const stop = (name: string, kind: "home" | "station"): Etappe["from"] => ({ name, lat: 0, lon: 0, kind });
const leg = (to: "home" | "station", date?: string): Etappe =>
  ({ from: stop("Düsseldorf", "home"), to: stop(to === "home" ? "Düsseldorf" : "Verona", to), date, km: 1000, min: 600, path: PATH, cc: {}, est: false });
const stay = (id: string, place: string, from: string, to: string): Item =>
  ({ id, cat: "stay", name: "Unterkunft " + place, status: "chosen", from, to, options: [{ id: "o" + id, label: place, price: { mode: "unit", currency: "EUR", unit: 300 }, query: { place, checkin: from, checkout: to, adults: 2, childAges: [], rooms: 1 } }] });
const trip = (items: Item[] = []): Trip => ({
  id: "t", name: "Roadtrip", place: "Verona", country: "Italien", from: "2027-07-12", to: "2027-07-20",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }, { id: "c", name: "Cleo", household: "Klein", age: 38, active: false }],
  items, tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 }, kmCost: 0.3 }
});

describe("Punkt an der Strecke", () => {
  it("Anfang, Ende und Bruchteile liegen auf dem Verlauf, auch über Knicke hinweg", () => {
    expect(along(PATH, 0)).toEqual([0, 0]);
    expect(along(PATH, 1)[1]).toBeCloseTo(3, 6);
    // ein Drittel der Gesamtstrecke ist genau der erste Wegpunkt, die Hälfte liegt im zweiten Abschnitt
    expect(along(PATH, 1 / 3)[1]).toBeCloseTo(1, 6);
    expect(along(PATH, 0.5)[1]).toBeCloseTo(1.5, 6);
  });

  it("Strecke ohne Länge: der Punkt selbst", () => {
    expect(along([[45, 10], [45, 10]], 0.5)).toEqual([45, 10]);
    expect(along([[45, 10]], 0.5)).toEqual([45, 10]);
  });
});

describe("Etappe teilen", () => {
  it("ohne Fahrtag oder mit nur einer Etappe passiert nichts", () => {
    const t = trip();
    expect(splitLeg(t, leg("station"), 3, () => null)).toEqual([]);
    expect(splitLeg(t, leg("station", "2027-07-12"), 1, () => null)).toEqual([]);
    expect(t.items).toHaveLength(0);
    expect(t.to).toBe("2027-07-20");
  });

  it("drei Etappen = zwei Stopps mit je einer Nacht, Richtwert für alle, die mitreisen; Suche nur für Erwachsene", () => {
    const t = trip();
    const asked: LL[] = [];
    const out = splitLeg(t, leg("station", "2027-07-12"), 3, p => { asked.push(p); return { name: asked.length === 1 ? "Ulm" : "Innsbruck" }; });
    expect(out.map(i => [i.name, i.from, i.to])).toEqual([["Zwischenstopp Ulm", "2027-07-12", "2027-07-13"], ["Zwischenstopp Innsbruck", "2027-07-13", "2027-07-14"]]);
    // die Stopps liegen bei einem und zwei Dritteln der Strecke
    expect(asked.map(p => Math.round(p[1] * 100) / 100)).toEqual([1, 2]);
    for (const i of out) {
      expect(i).toMatchObject({ cat: "stay", status: "idea", hint: "road:stop" });
      // Anna und Ben reisen mit (Cleo nicht): 2 Personen, davon 1 Erwachsene
      expect(i.options[0]).toMatchObject({ estimate: true, price: { mode: "unit", unit: 2 * STOP_PER_PERSON }, query: { adults: 1, checkin: i.from, checkout: i.to } });
    }
    expect(t.items).toEqual(out);
  });

  it("kein Ort in der Nähe: Stopp heißt nach Start und Ziel", () => {
    const out = splitLeg(trip(), leg("station", "2027-07-12"), 2, () => null);
    expect(out[0].name).toBe("Zwischenstopp Düsseldorf – Verona");
  });

  it("Ziel ist eine Station: die Unterkunft dort beginnt später, das Reiseende bleibt", () => {
    const t = trip([stay("s1", "Verona", "2027-07-12", "2027-07-15"), stay("s2", "Venedig", "2027-07-15", "2027-07-18")]);
    splitLeg(t, leg("station", "2027-07-12"), 3, () => ({ name: "Ulm" }));
    expect(t.items.find(i => i.id === "s1")).toMatchObject({ from: "2027-07-14", to: "2027-07-15" });
    expect(t.items.find(i => i.id === "s2")).toMatchObject({ from: "2027-07-15", to: "2027-07-18" });
    expect(t.to).toBe("2027-07-20");
  });

  it("mindestens eine Nacht an der Station bleibt: sonst verschiebt sich die Ankunft nicht", () => {
    const t = trip([stay("s1", "Verona", "2027-07-12", "2027-07-13")]);
    splitLeg(t, leg("station", "2027-07-12"), 3, () => ({ name: "Ulm" }));
    expect(t.items.find(i => i.id === "s1")).toMatchObject({ from: "2027-07-12", to: "2027-07-13" });
  });

  it("gestrichene Unterkunft bleibt, wie sie ist", () => {
    const dropped = { ...stay("s1", "Verona", "2027-07-12", "2027-07-15"), status: "dropped" as const };
    const t = trip([dropped]);
    splitLeg(t, leg("station", "2027-07-12"), 2, () => ({ name: "Ulm" }));
    expect(t.items.find(i => i.id === "s1")?.from).toBe("2027-07-12");
  });

  it("Heimfahrt: die Reise endet um die Zahl der Stopps später", () => {
    const t = trip();
    splitLeg(t, leg("home", "2027-07-20"), 3, () => ({ name: "Ulm" }));
    expect(t.to).toBe("2027-07-22");
  });
});
