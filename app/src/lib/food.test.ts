import { describe, expect, it } from "vitest";
import world from "../../../public/world.json";
import packs from "../../../public/packs.json";
import places from "../../../public/places/pa.json";
import { foodPlan, foodRate, syncFood } from "./food";
import { totals } from "./calc";
import type { GeoData } from "./geo/places";
import type { Trip } from "./model";

const g = { world: world.countries, packs, places } as unknown as GeoData;
const trip = (): Trip => ({
  id: "t", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 8 }, { id: "c", name: "Cleo", household: "Hase", age: 35 }],
  households: { Hase: { arrive: "2027-07-20", depart: "2027-07-25" } },
  items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, detail: { misc: true }
});

describe("Verpflegung wie im Artefakt", () => {
  it("Tagessatz aus dem Länderpaket (Kroatien), sonst Schätzung nach Preisniveau", () => {
    const r = foodRate(g, trip(), "mix");
    expect(r.est).toBe(false);
    expect(r.eur).toBeGreaterThanOrEqual(38);
    expect(r.eur).toBeLessThan(45);
    const jp = foodRate(g, { ...trip(), place: "Tokyo", country: "Japan" }, "mix");
    expect(jp.est).toBe(true);
    expect(jp.eur).toBe(Math.round(35 * Math.pow(0.75, 0.7)));
  });
  it("je Familie die Tage vor Ort; eigener Stil je Familie", () => {
    const t = trip();
    t.food = { on: true, style: "self", hh: { Hase: "treat" } };
    const rows = foodPlan(t, g);
    expect(rows.map(r => [r.hh, r.days, r.style, r.own])).toEqual([["Klein", 8, "self", false], ["Hase", 6, "treat", true]]);
  });
  it("legt Posten an, rechnet Kinder mit 50 %, ändert nichts beim zweiten Mal, räumt beim Ausschalten auf", () => {
    const t = trip();
    t.food = { on: true, style: "mix" };
    expect(syncFood(t, g)).toBe(true);
    const klein = t.items.find(i => i.hh === "Klein")!;
    expect(klein).toMatchObject({ cat: "misc", auto: "food", name: "Verpflegung Klein", participants: ["a", "b"] });
    const p = klein.options[0].price;
    expect(p.qty).toBe(8);
    expect(p.child).toBe(Math.round(p.adult! / 2));
    expect(totals(t).items[klein.id].net).toBe((p.adult! + p.child!) * 8);
    expect(syncFood(t, g)).toBe(false);
    t.food.on = false;
    expect(syncFood(t, g)).toBe(true);
    expect(t.items).toHaveLength(0);
  });

  it("richtet sich nach der Verpflegung der Unterkunft; eigene Wahl der Familie geht vor", () => {
    const t = trip();
    t.food = { on: true, style: "mix", hh: { Hase: "treat" } };
    t.detail = { misc: true, stay: true };
    const stay = (board?: "breakfast" | "half" | "all") => ({ id: "s", cat: "stay" as const, name: "Hotel", status: "chosen" as const, from: "2027-07-18", to: "2027-07-25",
      options: [{ id: "o", label: "Hotel", price: { mode: "unit" as const, currency: "EUR", unit: 1000, basis: "stay" as const }, stay: board ? { board } : {} }] });
    t.items = [stay("half")];
    let rows = foodPlan(t, g);
    expect(rows.map(r => [r.hh, r.style, r.board])).toEqual([["Klein", "hb", "half"], ["Hase", "treat", undefined]]);
    t.items = [stay("all")];
    expect(foodPlan(t, g)[0].style).toBe("ai");
    // Frühstück: gleicher Stil, gut ein Fünftel weniger
    const mix = foodPlan({ ...t, items: [stay()] }, g)[0].eur;
    t.items = [stay("breakfast")];
    rows = foodPlan(t, g);
    expect(rows[0]).toMatchObject({ style: "mix", board: "breakfast", eur: Math.round(mix * 0.8) });
    // Posten sagt, woher die Verpflegung kommt
    syncFood(t, g);
    expect(t.items.find(i => i.hh === "Klein")!.options[0].detail).toContain("Verpflegung laut Unterkunft: Frühstück");
  });
});
