import { beforeEach, describe, expect, it } from "vitest";
import { CRUISE_TIP, autoExtras, syncTips, tipCc } from "./fees";
import { calcItem } from "./calc";
import { newCruise } from "./cruise";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";
import { tipCtx } from "./tipsState.svelte";

// Land und Vorliebe wie in der App (FoodCard): nur im Speicher
// Land aus der Reise (Name oder ISO-Code), Vorliebe nur im Speicher
let land = "";
const ctx = (cc?: string, on = true) => { land = cc || ""; syncTips(on); };
const trip = (x: Partial<Trip> = {}): Trip => ({
  id: "t", name: "T", place: "Ort", from: "2027-06-05", to: "2027-06-12",
  travelers: [{ id: "a", name: "A", age: 40, household: "K" }, { id: "b", name: "B", age: 38, household: "K" }],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, ...x, country: x.country ?? land
});
const stay = (x: Partial<Item> = {}): Item => ({ id: "s", cat: "stay", name: "Hotel", status: "chosen", from: "2027-06-05", to: "2027-06-12",
  options: [{ id: "o", label: "Hotel", price: { mode: "unit", basis: "stay", currency: "EUR", unit: 700 } }], ...x });
const tipsOf = (it: Item, t: Trip) => autoExtras(it, it.options[0], t, () => 1).filter(x => x.kind === "tips");

describe("Trinkgeld als versteckte Kosten (#517)", () => {
  beforeEach(() => ctx());
  it("Unterkunft nach der Sitte im Land, pro Nacht, vor Ort, geschätzt", () => {
    ctx("HR");
    const [x] = tipsOf(stay(), trip());
    const t = trip({ country: "Kroatien" });
    expect(x).toMatchObject({ id: "auto:tips", basis: "night", pay: "onsite", est: true, amount: 3 });
    expect(calcItem(stay(), t).net).toBeCloseTo(700 + 7 * 3);
    expect(tipsOf(stay(), trip({ country: "Vereinigte Staaten" }))[0].amount).toBe(5);
    expect(tipsOf(stay(), trip({ country: "United States" }))[0].amount).toBe(5);
  });
  it("ohne Land, Land ohne Trinkgeldsitte, privat oder eigener Eintrag: nichts", () => {
    expect(tipsOf(stay(), trip())).toEqual([]);
    ctx("JP");
    expect(tipsOf(stay(), trip())).toEqual([]);
    ctx("HR");
    expect(tipsOf(stay({ private: { place: "Ort" } }), trip())).toEqual([]);
    const own = stay();
    own.options[0].extras = [{ id: "x", kind: "tips", amount: 10, basis: "booking", pay: "onsite" }];
    expect(tipsOf(own, trip())).toEqual([]);
  });
  it("Kreuzfahrt pro Person und Nacht, unabhängig vom Land", () => {
    const t = trip(), it0 = newCruise(t, "EUR");
    const [x] = tipsOf(it0, t);
    expect(x).toMatchObject({ id: "auto:tips:cruise", basis: "personNight", amount: CRUISE_TIP });
    expect(calcItem(it0, t).net).toBeCloseTo(CRUISE_TIP * 2 * 7);
  });
  it("Vorliebe aus: kein Trinkgeld; weggeklickt zählt nicht", () => {
    ctx("HR", false);
    expect(tipsOf(stay(), trip())).toEqual([]);
    ctx("HR");
    const it0 = stay();
    it0.options[0].autoOff = ["auto:tips"];
    const t = trip();
    expect(tipsOf(it0, t)[0].off).toBe(true);
    expect(calcItem(it0, t).net).toBeCloseTo(700);
  });
  it("Land der Unterkunft (Suche) vor dem der Reise", () => {
    const s = stay();
    s.options[0].query = { place: "Split", country: "Kroatien", checkin: "2027-06-05", checkout: "2027-06-12", adults: 2, childAges: [], rooms: 1 };
    expect(tipsOf(s, trip({ country: "Japan" }))[0].amount).toBe(3);
  });
  it("Land aus der Reise: ISO-Code oder Name in einer Sprache der App; Vorliebe nur im Speicher", () => {
    expect(tipCc("hr")).toBe("HR");
    expect(tipCc("Kroatien")).toBe("HR");
    expect(tipCc("Croatia")).toBe("HR");
    expect(tipCc("Atlantis")).toBeUndefined();
    expect(syncTips(false)).toBe(true);
    expect(tipCtx.off).toBe(true);
    expect(syncTips(false)).toBe(false);
  });
});
