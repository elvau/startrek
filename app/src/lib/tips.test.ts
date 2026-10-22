import { describe, expect, it } from "vitest";
import { CRUISE_TIP, autoExtras, syncTips } from "./fees";
import { calcItem } from "./calc";
import { newCruise } from "./cruise";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";

const trip = (x: Partial<Trip> = {}): Trip => ({
  id: "t", name: "T", place: "Ort", country: "", from: "2027-06-05", to: "2027-06-12",
  travelers: [{ id: "a", name: "A", age: 40, household: "K" }, { id: "b", name: "B", age: 38, household: "K" }],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, ...x
});
const stay = (x: Partial<Item> = {}): Item => ({ id: "s", cat: "stay", name: "Hotel", status: "chosen", from: "2027-06-05", to: "2027-06-12",
  options: [{ id: "o", label: "Hotel", price: { mode: "unit", basis: "stay", currency: "EUR", unit: 700 } }], ...x });
const tipsOf = (it: Item, t: Trip) => autoExtras(it, it.options[0], t, () => 1).filter(x => x.kind === "tips");

describe("Trinkgeld als versteckte Kosten (#517)", () => {
  it("Unterkunft nach der Sitte im Land, pro Nacht, vor Ort, geschätzt", () => {
    const t = trip({ tips: { cc: "HR" } });
    const [x] = tipsOf(stay(), t);
    expect(x).toMatchObject({ id: "auto:tips", basis: "night", pay: "onsite", est: true, amount: 3 });
    expect(calcItem(stay(), t).net).toBeCloseTo(700 + 7 * 3);
    expect(tipsOf(stay(), trip({ tips: { cc: "US" } }))[0].amount).toBe(5);
  });
  it("ohne Land, Land ohne Trinkgeldsitte, privat oder eigener Eintrag: nichts", () => {
    expect(tipsOf(stay(), trip())).toEqual([]);
    expect(tipsOf(stay(), trip({ tips: { cc: "JP" } }))).toEqual([]);
    expect(tipsOf(stay({ private: { place: "Ort" } }), trip({ tips: { cc: "HR" } }))).toEqual([]);
    const own = stay();
    own.options[0].extras = [{ id: "x", kind: "tips", amount: 10, basis: "booking", pay: "onsite" }];
    expect(tipsOf(own, trip({ tips: { cc: "HR" } }))).toEqual([]);
  });
  it("Kreuzfahrt pro Person und Nacht, unabhängig vom Land", () => {
    const t = trip(), it0 = newCruise(t, "EUR");
    const [x] = tipsOf(it0, t);
    expect(x).toMatchObject({ id: "auto:tips:cruise", basis: "personNight", amount: CRUISE_TIP });
    expect(calcItem(it0, t).net).toBeCloseTo(CRUISE_TIP * 2 * 7);
  });
  it("Vorliebe aus: kein Trinkgeld; weggeklickt zählt nicht", () => {
    expect(tipsOf(stay(), trip({ tips: { cc: "HR", off: true } }))).toEqual([]);
    const it0 = stay();
    it0.options[0].autoOff = ["auto:tips"];
    const t = trip({ tips: { cc: "HR" } });
    expect(tipsOf(it0, t)[0].off).toBe(true);
    expect(calcItem(it0, t).net).toBeCloseTo(700);
  });
  it("Abgleich mit Land und Vorliebe", () => {
    const t = trip();
    expect(syncTips(t, true, "HR")).toBe(true);
    expect(t.tips).toEqual({ cc: "HR" });
    expect(syncTips(t, true, "HR")).toBe(false);
    expect(syncTips(t, false, undefined)).toBe(true);
    expect(t.tips).toEqual({ off: true });
    syncTips(t, true, undefined);
    expect(t.tips).toBeUndefined();
  });
});
