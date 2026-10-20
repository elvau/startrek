import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, uid, type Trip } from "../model";
import { importToTrip } from "./apply";
import { applyParts } from "./parts";
import { bagFee, reality, round10 } from "./reality";
import type { ImportedOffer } from "./ai";

const AT = "2026-10-20T12:00:00Z";
const blank = (): Trip => ({ id: "t", name: "", place: "", country: "", travelers: [{ id: "p", name: "Fuchs", household: "Fuchs", kind: "adult", placeholder: true }], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } });
const pkg: ImportedOffer = {
  kind: "package", from: "2027-05-10", to: "2027-05-17", adults: 4, price: { total: 796 }, provider: "Anbieter",
  flights: { legs: [{ dir: "out", from: "DUS", to: "PMI", carrier: "Ryanair" }, { dir: "back", from: "PMI", to: "DUS", carrier: "Ryanair" }] },
  stay: { name: "Hotel Sol", board: "breakfast", boards: [{ board: "breakfast", extra: 0 }, { board: "half", extra: 18 }] },
  transfer: { included: true }, extras: [{ kind: "citytax", amount: 2, basis: "personNight", pay: "onsite" }]
};
/** statt Länderdaten: Verpflegung je Stil und Verpflegung der Unterkunft, 7 Tage */
const food = (t: Trip) => {
  t.items = t.items.filter(i => i.auto !== "food");
  if (!t.food?.on) return;
  const st = t.items.find(i => i.cat === "stay")?.options[0].stay?.board;
  const day = (t.food.style === "out" ? 30 : 15) * (st === "half" ? 0.5 : 1);
  t.items.push({ id: "food", cat: "misc", name: "Verpflegung", auto: "food", status: "idea", options: [{ id: uid(), label: "", estimate: true, price: { mode: "person", currency: "EUR", adult: day, qty: 7 } }] });
};

describe("Realitätscheck (#461)", () => {
  it("Koffer je Strecke: Billigflieger, sonst allgemein", () => {
    expect([bagFee("Ryanair"), bagFee("FR"), bagFee("Lufthansa")]).toEqual([40, 40, 35]);
  });
  it("Pauschalreise: Angebot, Kurtaxe, Koffer (nur teuer) und Essen als Spanne pro Kopf", () => {
    const trip = blank();
    importToTrip(trip, pkg, AT);
    const r = reality(trip, { food: true }, food);
    expect(r.persons).toBe(4);
    expect(r.advertised).toBe(199);
    expect(r.offer).toEqual({ lo: 199, hi: 199 });
    expect(r.boards.map(b => `${b.board}:${b.extra}:${b.included}`)).toEqual(["breakfast:0:true", "half:18:false"]);
    const bag = r.rows.find(x => x.assumption === "bag")!;
    expect([bag.lo, bag.hi, bag.part]).toEqual([0, 80, "real"]);
    const tax = r.rows.find(x => x.name.includes("Kurtaxe") || x.key.endsWith(":x0"))!;
    expect([tax.lo, tax.hi, tax.part]).toEqual([14, 14, "real"]);
    const f = r.rows.find(x => x.assumption === "food")!;
    expect([f.lo, f.hi, f.part]).toEqual([105, 210, "real"]);
    expect(r.real.lo).toBeGreaterThan(199 + 14 + 105 - 1);
    expect(r.real.hi - r.real.lo).toBeCloseTo(80 + 105, 0);
    expect(r.whole).toBeNull();
  });
  it("Annahme festlegen verengt die Spanne; Essen aus, Halbpension mit Aufpreis laut Angebot", () => {
    const trip = blank();
    importToTrip(trip, pkg, AT);
    const pinned = reality(trip, { food: true, pin: { bag: "lo", food: "lo" } }, food);
    expect(pinned.real.hi - pinned.real.lo).toBeLessThan(1);
    const noFood = reality(trip, { food: false }, food);
    expect(noFood.rows.some(x => x.assumption === "food")).toBe(false);
    const half = reality(trip, { food: true, board: "half" }, food);
    const add = half.rows.find(x => x.name.includes("Halbpension"))!;
    expect([add.lo, add.hi, add.part]).toEqual([18 * 7, 18 * 7, "real"]);
    expect(half.rows.find(x => x.assumption === "food")!.lo).toBeCloseTo(52.5);
    expect(half.board).toBe("half");
  });
  it("nur Flug: keine Unterkunft eingerechnet, Essen zählt zur ganzen Reise; Ergänztes nur zur ganzen Reise", () => {
    const trip = blank();
    importToTrip(trip, { kind: "flight", adults: 2, price: { perPerson: 99 }, flights: { legs: [{ dir: "out", from: "DUS", to: "BCN" }], baggage: { cabin: 1, checked: 0 } } }, AT);
    expect(reality(trip, { food: true }, food).whole).toBeNull();
    applyParts(trip, { rental: "estimate" });
    const r = reality(trip, { food: true }, food);
    expect(r.offer).toEqual({ lo: 99, hi: 99 });
    expect(r.rows.some(x => x.assumption === "bag")).toBe(false);
    expect(r.rows.find(x => x.assumption === "food")?.part).toBe("whole");
    expect(r.rows.find(x => x.name === "Mietwagen" || x.key === trip.items.find(i => i.hint === "rental")!.id)?.part).toBe("whole");
    expect(r.whole!.lo).toBeGreaterThan(r.real.lo);
    expect(round10({ lo: 103.4, hi: 181 })).toEqual({ lo: 100, hi: 190 });
  });
});
