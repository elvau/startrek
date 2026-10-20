import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { applyParts, defaultChoices, hasMissing, partsOf } from "./parts";
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
});
