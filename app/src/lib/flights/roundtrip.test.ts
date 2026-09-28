import { describe, expect, it } from "vitest";
import { legQuery, nightsBetween, roundLegs, searchRound, type RoundPlan } from "./roundtrip";
import { roundToOption } from "./app";
import type { FlightOffer, FlightQuery, SearchResult } from "./types";

const place = (code: string, airports = [code]) => ({ name: code, code, airports });
const plan: RoundPlan = {
  from: place("DUS", ["DUS", "CGN"]), home: true, depart: "2027-03-01", departTo: "2027-03-03",
  stops: [{ place: place("GIG"), min: 5, max: 7 }, { place: place("EZE"), min: 3, max: 4 }],
  adults: 2, children: 0, infants: 0, maxStops: 1
};

const offer = (from: string, to: string, dep: string, price: number): FlightOffer => ({
  id: `${from}${to}${dep}`, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR", url: `https://kiwi.test/${from}${to}`,
  out: { from, to, dep: `${dep}T10:00:00`, arr: `${dep}T20:00:00`, minutes: 600, stops: 0, route: [from, to], carriers: ["XX"], flights: [`XX${from}${dep}`] }
});
const days = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) out.push(d); return out; };

/** nachgestellter Such-Dienst: jeden Tag im Fenster ein Flug, Preis steigt mit dem Tag */
function fake(asked: FlightQuery[]) {
  return async (q: FlightQuery): Promise<SearchResult> => {
    asked.push(q);
    const from = q.fromAirports?.[0] || q.from, to = q.toAirports?.[0] || q.to;
    const offers = days(q.depart, q.departTo || q.depart).map((d, i) => offer(from, to, d, 100 + 10 * i));
    return { offers, sources: [{ id: "kiwi", name: "Kiwi.com", configured: true, ok: true, count: offers.length }] };
  };
}

describe("Rundreise", () => {
  it("Strecken: Start → Stationen → zurück", () => {
    expect(roundLegs(plan).map(([a, b]) => `${a.code}-${b.code}`)).toEqual(["DUS-GIG", "GIG-EZE", "EZE-DUS"]);
    expect(roundLegs({ ...plan, home: false }).map(([a, b]) => `${a.code}-${b.code}`)).toEqual(["DUS-GIG", "GIG-EZE"]);
  });

  it("Anfrage je Strecke: Hinflug mit Zeitfenster, Orte als Code-Listen", () => {
    const q = legQuery(plan, plan.from, plan.stops[0].place, "2027-03-01", "2027-03-03");
    expect(q).toMatchObject({ from: "DUS", fromAirports: ["DUS", "CGN"], to: "GIG", depart: "2027-03-01", departTo: "2027-03-03", adults: 2, maxStops: 1 });
    expect(q.ret).toBeUndefined();
  });

  it("kombiniert passend zu den Nächten, günstigste zuerst", async () => {
    const asked: FlightQuery[] = [];
    const res = await searchRound(plan, fake(asked));
    expect(res.errors).toEqual([]);
    expect(res.trips.length).toBeGreaterThan(0);
    const best = res.trips[0];
    expect(best.legs.map(l => `${l.out.from}-${l.out.to}`)).toEqual(["DUS-GIG", "GIG-EZE", "EZE-DUS"]);
    // günstigstes: erster Tag jeder Stufe, also minimale Nächte
    expect(best.legs.map(l => l.out.dep.slice(0, 10))).toEqual(["2027-03-01", "2027-03-06", "2027-03-09"]);
    expect(best.nights).toEqual([5, 3]);
    expect(best.price).toBe(300);
    for (const t of res.trips) {
      expect(t.nights[0]).toBeGreaterThanOrEqual(5); expect(t.nights[0]).toBeLessThanOrEqual(7);
      expect(t.nights[1]).toBeGreaterThanOrEqual(3); expect(t.nights[1]).toBeLessThanOrEqual(4);
    }
    // Stufe 2 und 3: Fenster ab den Ankunftstagen der besten Kombinationen (höchstens 3 Tage)
    expect(asked[0]).toMatchObject({ depart: "2027-03-01", departTo: "2027-03-03" });
    expect(asked.filter(q => q.from === "GIG").map(q => [q.depart, q.departTo])).toContainEqual(["2027-03-06", "2027-03-08"]);
    expect(asked.length).toBeLessThanOrEqual(1 + 3 + 3);
  });

  it("keine passende Verbindung: Hinweis statt Treffer", async () => {
    const none = async (q: FlightQuery): Promise<SearchResult> => ({ offers: q.from === "GIG" ? [] : [offer(q.from, q.to, q.depart, 100)], sources: [] });
    const res = await searchRound(plan, none);
    expect(res.trips).toEqual([]);
    expect(res.errors[0]).toMatch(/GIG → EZE/);
  });

  it("Fehler einer Strecke wird gemeldet", async () => {
    const res = await searchRound(plan, async () => { throw new Error("Kiwi antwortet nicht"); });
    expect(res.errors[0]).toBe("DUS → GIG: Kiwi antwortet nicht");
  });

  it("als Angebot: Hin, Weiter, Zurück", async () => {
    const res = await searchRound(plan, fake([]));
    const o = roundToOption(res.trips[0], true);
    expect(o.legs!.map(l => l.dir)).toEqual(["out", "via", "back"]);
    expect(o.label).toBe("Rundreise DUS → GIG → EZE → DUS");
    expect(o.price).toMatchObject({ mode: "unit", unit: 300 });
    expect(roundToOption(res.trips[0], false).legs!.at(-1)!.dir).toBe("via");
  });

  it("Nächte zwischen Landung und Abflug", () => {
    expect(nightsBetween("2027-03-01T20:00", "2027-03-06T10:00")).toBe(5);
  });
});

describe("Rundreise: überlappende Fenster", () => {
  it("derselbe Flug aus zwei Fenstern zählt nur einmal", async () => {
    // gleiche id für denselben Tag, egal aus welchem Fenster
    const f = async (q: FlightQuery): Promise<SearchResult> => ({ offers: days(q.depart, q.departTo || q.depart).map(d => offer(q.from, q.to, d, 100)), sources: [] });
    const res = await searchRound(plan, f);
    const ids = res.trips.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
