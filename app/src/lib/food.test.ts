import { describe, expect, it } from "vitest";
import world from "../../../public/world.json";
import packs from "../../../public/packs.json";
import places from "../../../public/places/pa.json";
import { foodGroups, foodPlan, foodRate, syncFood } from "./food";
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
    expect(rows.map(r => [r.hh, r.days, r.style, r.own])).toEqual([["Klein", 7, "self", false], ["Hase", 5, "treat", true]]);
  });
  it("legt Posten an, rechnet Kinder mit 50 %, ändert nichts beim zweiten Mal, räumt beim Ausschalten auf", () => {
    const t = trip();
    t.food = { on: true, style: "mix" };
    expect(syncFood(t, g)).toBe(true);
    const klein = t.items.find(i => i.hh === "Klein")!;
    expect(klein).toMatchObject({ cat: "misc", auto: "food", name: "Verpflegung Klein", participants: ["a", "b"] });
    const p = klein.options[0].price;
    expect(p.qty).toBe(7);
    expect(p.child).toBe(Math.round(p.adult! / 2));
    expect(totals(t).items[klein.id].net).toBe((p.adult! + p.child!) * 7);
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

  it("Gruppe mit 15 Personen (jede eine eigene Familie): ein Posten „Verpflegung“ statt 15", () => {
    const t = trip();
    t.households = {};
    t.travelers = Array.from({ length: 15 }, (_, i) => ({ id: "p" + i, name: "P" + i, household: "P" + i }));
    t.food = { on: true, style: "mix" };
    syncFood(t, g);
    const food = t.items.filter(i => i.auto === "food");
    expect(food).toHaveLength(1);
    expect(food[0]).toMatchObject({ name: "Verpflegung", hh: "*" });
    expect(food[0].participants).toHaveLength(15);
    // eine Person isst anders: zwei Posten (14 und 1)
    t.food.hh = { P3: "treat" };
    syncFood(t, g);
    const two = t.items.filter(i => i.auto === "food").map(i => [i.name, i.participants?.length]);
    expect(two).toEqual([["Verpflegung (14 Familien)", 14], ["Verpflegung P3", 1]]);
    expect(foodGroups(foodPlan(t, g)).map(x => x.hhs.length)).toEqual([14, 1]);
  });

  it("Rundreise (#596): Verpflegung je Nacht nach der Unterkunft, in der die Familie schläft", () => {
    const t = trip();
    t.food = { on: true, style: "mix" };
    t.detail = { misc: true, stay: true };
    const stay = (id: string, from: string, to: string, board?: "breakfast" | "half") => ({ id, cat: "stay" as const, name: id, status: "chosen" as const, from, to,
      options: [{ id: id + "o", label: id, price: { mode: "unit" as const, currency: "EUR", unit: 300, basis: "stay" as const }, stay: board ? { board } : {} }] });
    // 3 Nächte Apartment ohne Verpflegung, dann 2 Nächte Frühstück, 2 Nächte Halbpension
    t.items = [stay("apt", "2027-07-18", "2027-07-21"), stay("b&b", "2027-07-21", "2027-07-23", "breakfast"), stay("hp", "2027-07-23", "2027-07-25", "half")];
    const mix = foodRate(g, t, "mix").eur, hb = foodRate(g, t, "hb").eur;
    const [klein, hase] = foodPlan(t, g);
    expect(klein.parts).toEqual([
      { style: "mix", days: 3, eur: mix },
      { style: "mix", board: "breakfast", days: 2, eur: Math.round(mix * 0.8) },
      { style: "hb", board: "half", days: 2, eur: hb }
    ]);
    expect(klein).toMatchObject({ days: 7, style: "mix", eur: Math.round((3 * mix + 2 * Math.round(mix * 0.8) + 2 * hb) / 7) });
    expect(klein.board).toBeUndefined();
    // Hase erst ab dem 20.: 1 Nacht Apartment, dann wie oben
    expect(hase.parts?.map(p => [p.board || p.style, p.days])).toEqual([["breakfast", 2], ["half", 2], ["mix", 1]]);
    syncFood(t, g);
    expect(t.items.find(i => i.hh === "Klein")!.options[0].detail).toContain("Verpflegung laut Unterkünften: 3 Tage Gemischt, 2 Tage Frühstück, 2 Tage Halbpension");
    // früher galt die Halbpension des letzten Hotels für die ganze Reise; ohne Angabe überall: eine Verpflegung wie bisher
    t.items = [stay("apt", "2027-07-18", "2027-07-21"), stay("apt2", "2027-07-21", "2027-07-25")];
    const one = foodPlan(t, g)[0];
    expect(one).toMatchObject({ style: "mix", eur: mix, days: 7 });
    expect(one.parts).toBeUndefined();
  });

  it("Unterkunft ohne Zeitraum gilt wie bisher für die ganze Reise, Nächte außerhalb datierter Unterkünfte auch", () => {
    const t = trip();
    t.food = { on: true, style: "mix" };
    t.detail = { misc: true, stay: true };
    t.items = [{ id: "s", cat: "stay", name: "Hotel", status: "chosen", options: [{ id: "o", label: "Hotel", price: { mode: "unit", currency: "EUR", unit: 1000, basis: "stay" }, stay: { board: "half" } }] }];
    const rows = foodPlan(t, g);
    expect(rows.map(r => [r.style, r.board, r.parts])).toEqual([["hb", "half", undefined], ["hb", "half", undefined]]);
  });

  it("Rundreise über mehrere Länder: Tagessatz je Station nach dem Ort der Unterkunft (#596)", () => {
    const t = { ...trip(), place: "Göteborg", country: "Schweden", households: {} };
    t.food = { on: true, style: "mix" };
    const stay = (id: string, from: string, to: string, place: string, country: string) => ({ id, cat: "stay" as const, name: id, status: "chosen" as const, from, to,
      options: [{ id: id + "o", label: id, price: { mode: "unit" as const, currency: "EUR", unit: 300, basis: "stay" as const }, query: { place, country, checkin: from, checkout: to, adults: 2, childAges: [], rooms: 1 } }] });
    t.items = [stay("se", "2027-07-18", "2027-07-21", "Göteborg", "Sweden"), stay("no", "2027-07-21", "2027-07-25", "Bergen", "Norway")];
    const se = foodRate(g, { ...t, country: "SE" }, "mix").eur, no = foodRate(g, { ...t, place: "Bergen", country: "NO" }, "mix").eur;
    expect(se).not.toBe(no);
    const [row] = foodPlan(t, g);
    expect(row.parts).toEqual([{ style: "mix", days: 4, eur: no, place: "Bergen" }, { style: "mix", days: 3, eur: se, place: "Göteborg" }]);
    expect(row.eur).toBe(Math.round((3 * se + 4 * no) / 7));
    syncFood(t, g);
    expect(t.items.find(i => i.auto === "food")!.options[0].detail).toContain("4 Tage Gemischt (Bergen), 3 Tage Gemischt (Göteborg)");
    // eigener Stil der Familie: Ort zählt trotzdem
    t.food = { on: true, style: "mix", hh: { Klein: "self" } };
    expect(foodPlan(t, g)[0].parts?.map(p => [p.style, p.place])).toEqual([["self", "Bergen"], ["self", "Göteborg"]]);
  });
});

