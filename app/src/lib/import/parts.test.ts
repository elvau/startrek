import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { applyArrival, applyParts, arrivalOf, defaultChoices, hasMissing, partsOf, pick } from "./parts";
import { importToTrip } from "./apply";
import type { ImportedOffer } from "./ai";

const blank = (): Trip => ({ id: "t", name: "", place: "", country: "", travelers: [{ id: "p", name: "Fuchs", household: "Fuchs", kind: "adult", placeholder: true }], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } });
const legs = [{ dir: "out" as const, from: "DUS", to: "PMI" }];
const pkg: ImportedOffer = { kind: "package", from: "2027-05-10", to: "2027-05-17", adults: 4, price: { total: 796 }, flights: { legs }, stay: { name: "Hotel Sol" } };

describe("Was fehlt noch? (#459)", () => {
  it("Pauschalreise ohne Transfer: Flug und Unterkunft im Paket, Anreise rechnet die App, Transfer, Mietwagen, Ausflüge fehlen", () => {
    expect(partsOf(pkg).map(p => `${p.id}:${p.state}`)).toEqual(["flight:package", "stay:package", "access:app", "transfer:missing", "rental:missing", "fun:missing"]);
    expect(defaultChoices(pkg)).toEqual({ transfer: "estimate", rental: "none", fun: "later" });
    expect(partsOf({ ...pkg, transfer: { included: true } }).find(p => p.id === "transfer")?.state).toBe("package");
  });
  it("nur Flug: Unterkunft fehlt (später), nur Hotel: Flug fehlt, kein Transfer und keine Anreise zum Flughafen", () => {
    const fl = partsOf({ kind: "flight", flights: { legs, price: 99 } });
    expect(fl.find(p => p.id === "stay")).toMatchObject({ state: "missing", def: "later" });
    expect(fl.find(p => p.id === "flight")?.state).toBe("offer");
    const st = partsOf({ kind: "stay", stay: { name: "Chalet" } });
    expect(st.map(p => p.id)).toEqual(["flight", "stay", "rental", "fun"]);
    expect(st[0]).toMatchObject({ state: "missing", choices: ["search", "later", "none"] });
    expect(hasMissing(pkg)).toBe(true);
  });
  it("übernehmen: Mietwagen geschätzt, kein Transfer ersetzt die Schätzung, Suchen in fester Reihenfolge; nur Angebotsposten in offer.items", () => {
    const trip = blank();
    const offerItems = importToTrip(trip, pkg, "2026-10-20T12:00:00Z").map(i => i.id);
    expect(trip.offer).toMatchObject({ kind: "package", price: { total: 796 }, items: offerItems });
    const open = applyParts(trip, { rental: "estimate", transfer: "none", fun: "search", stay: "search" });
    expect(open).toEqual(["stay", "fun"]);
    const car = trip.items.find(i => i.hint === "rental")!;
    expect(car.options[0]).toMatchObject({ estimate: true, price: { qty: 8 } });
    expect(trip.items.find(i => i.hint === "transfer")?.options[0].price.unit).toBe(0);
    expect(trip.offer!.items).toEqual(offerItems);
    expect(applyParts(blank(), { transfer: "estimate", rental: "none" })).toEqual([]);
  });
  it("ohne Flug (#475): „Brauchen wir nicht“ fragt nach der Anreise, vorgewählt Auto; mit Flug entfällt die Frage", () => {
    const st: ImportedOffer = { kind: "stay", stay: { name: "Ferienpark" } };
    expect(partsOf(st).some(p => p.id === "arrival")).toBe(false);
    const c = pick(defaultChoices(st), "flight", "none");
    expect(c.arrival).toBe("car");
    expect(partsOf(st, c).map(p => p.id)).toEqual(["flight", "arrival", "stay", "rental", "fun"]);
    expect(partsOf(st, c)[1].choices).toEqual(["car", "train", "bus", "none"]);
    expect(arrivalOf(pick(c, "arrival", "train"))).toBe("train");
    expect(arrivalOf(pick(c, "arrival", "none"))).toBeNull();
    const back = pick(c, "flight", "search");
    expect(back.arrival).toBeUndefined();
    expect(arrivalOf(back)).toBeNull();
  });
  it("Anreise als Posten: Auto je 5 Personen mit Sprit, Bahn pro Person, als Schätzung; ohne Wohnort nichts", () => {
    const home = { name: "Köln", lat: 50.94, lon: 6.96, cc: "DE" }, dest = { name: "Dwerte", lat: 53.0, lon: 7.6, cc: "DE" };
    const trip = blank();
    trip.travelers = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, household: "Tiger", kind: "adult" as const }));
    const cars = applyArrival(trip, { flight: "none", arrival: "car" }, home, dest);
    expect(cars).toHaveLength(2);
    expect(cars[0]).toMatchObject({ cat: "transport", hint: "road:car", arrival: true, participants: ["p0", "p1", "p2", "p3", "p4"] });
    expect(cars[1].participants).toEqual(["p5", "p6", "p7"]);
    expect(cars[0].options[0].estimate).toBe(true);
    expect(cars[0].options[0].price.unit).toBeGreaterThan(50);
    expect(trip.detail?.transport).toBe(true);
    const t2 = blank();
    const [train] = applyArrival(t2, { flight: "none", arrival: "train" }, home, dest);
    expect(train).toMatchObject({ arrival: true, options: [{ estimate: true, price: { mode: "person" } }] });
    expect(train.options[0].price.adult).toBeGreaterThan(0);
    expect(train.participants).toBeUndefined();
    expect(applyArrival(blank(), { flight: "none", arrival: "bus" }, null, dest)).toEqual([]);
    expect(applyArrival(blank(), { flight: "later", arrival: "car" }, home, dest)).toEqual([]);
    expect(applyArrival(blank(), { flight: "none", arrival: "car" }, home, { name: "Mallorca", lat: 39.6, lon: 2.9, cc: "ES" })).toEqual([]);
  });
});
