import { describe, expect, it } from "vitest";
import { alternatives, isShort, legQuery, nightsBetween, roundLegs, searchRound, swapLeg, viaHours, type RoundPlan } from "./roundtrip";
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
    expect(roundLegs(plan).map(l => `${l.from.code}-${l.to.code}`)).toEqual(["DUS-GIG", "GIG-EZE", "EZE-DUS"]);
    expect(roundLegs({ ...plan, home: false }).map(l => `${l.from.code}-${l.to.code}`)).toEqual(["DUS-GIG", "GIG-EZE"]);
    expect(roundLegs(plan).map(l => l.after?.place.code)).toEqual([undefined, "GIG", "EZE"]);
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

describe("Gabelflug: kurze Station als langer Umstieg auf einem Ticket", () => {
  // DUS → Doha (0–1 Nacht) → Bangkok (5–7 Nächte) → zurück
  const bkk: RoundPlan = {
    ...plan, stops: [{ place: place("DOH"), min: 0, max: 1, via: true }, { place: place("BKK"), min: 5, max: 7 }]
  };

  it("kurz heißt höchstens eine Nacht; Stunden aus den Nächten", () => {
    expect(isShort(bkk.stops[0])).toBe(true);
    expect(isShort(bkk.stops[1])).toBe(false);
    expect(viaHours({ place: place("DOH"), min: 0, max: 1 })).toEqual([4, 48]);
    expect(viaHours({ place: place("DOH"), min: 1, max: 1 })).toEqual([10, 48]);
    expect(viaHours({ place: place("DOH"), min: 0, max: 0 })).toEqual([4, 24]);
  });

  it("Strecken: DUS → BKK über DOH, dann BKK → DUS", () => {
    const legs = roundLegs(bkk);
    expect(legs.map(l => `${l.from.code}-${l.to.code}`)).toEqual(["DUS-BKK", "BKK-DUS"]);
    expect(legs[0].via?.place.code).toBe("DOH");
    expect(legs[1].after?.place.code).toBe("BKK");
    // letzte Station bleibt Ziel, auch wenn sie kurz ist
    expect(roundLegs({ ...bkk, home: false, stops: [bkk.stops[1], { ...bkk.stops[0] }] }).map(l => l.to.code)).toEqual(["BKK", "DOH"]);
  });

  it("Anfrage mit Umstiegsort und Stunden, Aufenthalt aus dem Flug", async () => {
    const asked: FlightQuery[] = [];
    const f = async (q: FlightQuery): Promise<SearchResult> => {
      asked.push(q);
      const offers = days(q.depart, q.departTo || q.depart).map((d, i) => {
        const o = offer(q.from, q.to, d, 400 + 10 * i);
        if (q.via) o.out = { ...o.out, route: [q.from, "DOH", q.to], stops: 1, layovers: [{ at: "DOH", hours: 21 }] };
        return o;
      });
      return { offers, sources: [] };
    };
    const res = await searchRound(bkk, f);
    expect(asked[0]).toMatchObject({ from: "DUS", to: "BKK", via: ["DOH"], viaHours: [4, 48] });
    expect(asked.slice(1).every(q => !q.via)).toBe(true);
    const t = res.trips[0];
    expect(t.legs).toHaveLength(2);
    expect(t.stays).toEqual([{ name: "DOH", hours: 21 }, { name: "BKK", nights: 5 }]);
  });

  it("Andere Flüge je Strecke: passen zu den Nächten davor und danach, Tausch rechnet neu", async () => {
    const res = await searchRound(plan, fake([]));
    const rt = res.trips[0];
    // mittlere Strecke: muss zu beiden Nachbarn passen
    for (const o of alternatives(rt, 1)) {
      const before = nightsBetween(rt.legs[0].out.arr, o.out.dep), after = nightsBetween(o.out.arr, rt.legs[2].out.dep);
      expect(before).toBeGreaterThanOrEqual(5); expect(before).toBeLessThanOrEqual(7);
      expect(after).toBeGreaterThanOrEqual(3); expect(after).toBeLessThanOrEqual(4);
    }
    // letzte Strecke: 3–4 Nächte nach der Ankunft in EZE
    const alts = alternatives(rt, 2);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.some(o => o.id === rt.legs[2].id)).toBe(false);
    for (const o of alts) { const n = nightsBetween(rt.legs[1].out.arr, o.out.dep); expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(4); }
    expect(alts.map(o => o.price)).toEqual([...alts.map(o => o.price)].sort((a, b) => a - b));
    const sw = swapLeg(rt, 2, alts[0]);
    expect(sw.legs[2].id).toBe(alts[0].id);
    expect(sw.price).toBe(rt.price - rt.legs[2].price + alts[0].price);
    expect(sw.stays.find(x => x.name === "EZE")?.nights).toBe(nightsBetween(rt.legs[1].out.arr, alts[0].out.dep));
    expect(sw.id).not.toBe(rt.id);
    // erste Strecke: alles aus dem Startfenster, das zur zweiten passt
    for (const o of alternatives(rt, 0)) {
      const n = nightsBetween(o.out.arr, rt.legs[1].out.dep);
      expect(n).toBeGreaterThanOrEqual(5); expect(n).toBeLessThanOrEqual(7);
    }
  });
});
