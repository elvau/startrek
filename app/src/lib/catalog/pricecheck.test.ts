import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, uid, type Option, type Trip } from "../model";
import { takeEntry, type TakeOpts } from "./take";
import { applyStart, checkPrices, checkSum, estOnly, matchTour, toCheck, type PriceDeps } from "./pricecheck";
import type { CatalogEntry } from "./types";
import type { ActivityHit } from "../activities/types";
import type { FlightOffer, FlightQuery } from "../flights/types";
import type { StayOffer } from "../stays/types";

const tx: TakeOpts["tx"] = k => k;
const round: CatalogEntry = {
  v: 1, id: "kat1", source: "user", by: "reh42", lang: "de", title: "Istrien", kind: "round", group: { adults: 2, children: 0, infants: 0 }, months: [6], nights: 8,
  stops: [{ place: "Poreč", cc: "HR", lat: 45.23, lon: 13.6, nights: 5 }, { place: "Plitvice", cc: "HR", lat: 44.88, lon: 15.62, nights: 3, by: "car" }],
  costs: [{ cat: "stay", pp: 310, place: "Poreč", nights: 5 }, { cat: "stay", pp: 150, place: "Plitvice", nights: 3 }, { cat: "transport", pp: 95 }],
  tours: [{ name: "Bootstour Limski", pp: 35, day: 2, time: "10:00" }, { name: "Nationalpark Plitvice", pp: 30, day: 7 }],
  days: [], stand: "2026-11"
};
const KOELN = { lat: 50.94, lon: 6.96, name: "Köln" };

function trip(from?: string): Trip {
  const travelers = [{ id: "a", name: "A", household: "Klein", age: 40 }, { id: "b", name: "B", household: "Klein", age: 41 }];
  const r = takeEntry(round, { travelers, homes: { Klein: KOELN }, tours: "all", tx, ...(from ? { from } : {}) });
  return { id: "t", name: "Istrien", place: "Poreč", country: "Kroatien", from: r.to ? from : undefined, to: r.to, tiers: {}, settings: DEFAULT_SETTINGS, travelers, items: r.items, catalog: { id: round.id, stand: round.stand, rel: r.rel } };
}

const stay = (total: number, test = false): StayOffer => ({ id: uid(), source: "x", sourceName: "X", name: "Haus", total, currency: "EUR", ...(test ? { test } : {}) }) as StayOffer;
const flight = (price: number): FlightOffer => ({ price, currency: "EUR", sourceName: "Y", out: { from: "CGN", to: "PUY", dep: "2027-06-05T08:00", arr: "2027-06-05T10:00", carriers: ["Z"], stops: 0, minutes: 120, route: [] } }) as unknown as FlightOffer;
const hit = (title: string, price?: number): ActivityHit => ({ id: uid(), source: "v", sourceName: "V", title, currency: "EUR", ...(price ? { price } : {}) });
const opt = (label: string, unit: number): Option => ({ id: uid(), label, price: { mode: "unit", currency: "EUR", unit } });

function deps(over: Partial<PriceDeps> = {}) {
  const calls: FlightQuery[] = [];
  const d: PriceDeps = {
    stays: async q => (q.place === "Poreč" ? [stay(900), stay(700, true), stay(1000)] : []),
    flights: async q => { calls.push(q); return q.from === "CGN" ? [flight(500)] : [flight(420)]; },
    tours: async q => (q.place === "Poreč" ? [hit("Bootstour zum Limski-Kanal", 45), hit("Bootstour Limski günstig"), hit("Weinprobe", 30)] : [hit("Stadtführung", 20)]),
    stayQuery: (_t, it, place) => ({ place, checkin: it.from!, checkout: it.to!, adults: 2, childAges: [], rooms: 1, type: "all" }),
    pax: () => ({ adults: 2, children: 0, infants: 0 }),
    homeAirports: (_t, _ids, home) => (home?.name === "Köln" ? ["CGN", "DUS", "FRA"] : ["XXX"]),
    dest: p => (p ? { to: "PUY" } : null),
    stayOption: o => opt(o.name, o.total), flightOption: o => opt("Flug", o.price), tourOption: h => opt(h.title, h.price || 0),
    ...over
  };
  return { d, calls };
}

describe("Preise prüfen nach dem Übernehmen (#652)", () => {
  it("Lage der Posten relativ zum Reisebeginn; Reisebeginn nachtragen setzt Daten", () => {
    const t = trip();
    expect(t.from).toBeUndefined();
    expect(t.items.filter(i => i.cat === "stay").every(i => !i.from)).toBe(true);
    applyStart(t, "2027-06-05");
    expect([t.from, t.to]).toEqual(["2027-06-05", "2027-06-13"]);
    expect(t.items.filter(i => i.cat === "stay").map(i => [i.from, i.to])).toEqual([["2027-06-05", "2027-06-10"], ["2027-06-10", "2027-06-13"]]);
    expect(t.items.filter(i => i.cat === "attractions").map(i => i.day)).toEqual(["2027-06-06T10:00", "2027-06-11"]);
  });
  it("geprüft werden Unterkünfte, Flüge, Touren; Transport vor Ort ohne Suche", () => {
    const t = trip("2027-06-05");
    expect(toCheck(t).map(i => i.cat)).toEqual(["flights", "stay", "stay", "transport", "attractions", "attractions"]);
  });
  it("günstigstes echtes Angebot wird gewählt, Richtwert bleibt; Ergebnis je Posten mit Preis pro Person", async () => {
    const t = trip("2027-06-05");
    const { d, calls } = deps();
    const seen: string[] = [];
    const rows = await checkPrices(t, d, r => seen.push(r.state), new Date("2026-11-02T12:00:00Z"));
    expect(rows.map(r => r.state)).toEqual(["ok", "ok", "none", "skip", "ok", "none"]);
    expect(seen).toHaveLength(6);
    // Flug: nur die zwei nächsten Flughäfen, feste Daten, günstigster (DUS 420 € für 2)
    expect(calls.map(q => q.from)).toEqual(["CGN", "DUS"]);
    expect(calls[0]).toMatchObject({ depart: "2027-06-05", ret: "2027-06-13", to: "PUY" });
    expect(rows[0]).toMatchObject({ est: expect.any(Number), pp: 210 });
    // Unterkunft: Testangebot (700) nur hinter echten, also 900 für 2 Personen
    expect(rows[1]).toMatchObject({ est: 310, pp: 450 });
    const st = t.items.find(i => i.id === rows[1].item)!;
    expect(st.options).toHaveLength(2);
    expect(st.options.find(o => o.id === st.chosen)?.label).toBe("Haus");
    expect(estOnly(st)).toBe(false);
    // Tour: Titel passt, mit Euro-Preis
    expect(rows[4]).toMatchObject({ est: 35, pp: 45 });
    expect(t.catalog?.check).toEqual({ at: "2026-11-02T12:00:00.000Z", rows });
    expect(checkSum(rows)).toEqual({ est: rows[0].est! + 310 + 35, pp: 210 + 450 + 45, n: 3 });
  });
  it("erneut prüfen sucht nur, was noch keinen Preis hat; Fehler je Posten", async () => {
    const t = trip("2027-06-05");
    await checkPrices(t, deps().d);
    const { d } = deps({ stays: async () => { throw new Error("weg"); } });
    const rows = await checkPrices(t, d);
    expect(rows.map(r => r.state)).toEqual(["err", "skip", "none"]);
  });
  it("ohne Reisebeginn: Flug und Unterkunft ohne Suche", async () => {
    const t = trip();
    const rows = await checkPrices(t, deps().d);
    expect(rows.filter(r => r.state === "skip").length).toBe(4);
  });
  it("Tour passend: gemeinsame Wörter, nur mit Euro-Preis, bei Gleichstand günstiger", () => {
    expect(matchTour("Bootstour Limski", [hit("Bootstour zum Limski-Kanal", 45), hit("Bootstour Limski", 50), hit("Limski Bootstour ohne Preis")])?.price).toBe(45);
    expect(matchTour("Bootstour", [hit("Weinprobe", 30)])).toBeNull();
    expect(matchTour("Zoo", [hit("Zoo Pula", 10)])).toBeNull();
  });
});
