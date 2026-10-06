import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";
import { resetPresence, setPresence, span, timeline } from "./timeline";
import { householdShares, itemShares, totals } from "./calc";

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Test", place: "Testort", country: "Testland", from: "2027-07-10", to: "2027-07-31", tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [{ id: "a", name: "A", household: "Bednorz" }, { id: "b", name: "B", household: "Bednorz" }, { id: "c", name: "C", household: "Klein" }, { id: "o", name: "O", household: "Oma" }],
  items: [], detail: { stay: true }, ...over
} as Trip);
const stay = (from: string, to: string, perNight: number): Item => ({ id: from, cat: "stay", name: "Haus", status: "idea", from, to,
  options: [{ id: "o" + from, label: "Haus", price: { mode: "unit", currency: "EUR", unit: perNight, basis: "night" } }] });

describe("Zeitleiste (#228)", () => {
  it("je Familie: ohne Angabe die ganze Reise, mit Angabe eigene Zeiten; gleich lang erkannt", () => {
    const tl = timeline(trip())!;
    expect(tl.rows.map(r => [r.hh, r.src, r.persons])).toEqual([["Bednorz", "trip", 2], ["Klein", "trip", 1], ["Oma", "trip", 1]]);
    expect(tl.same).toBe(true);
    expect(tl.nights).toHaveLength(21);
    const t2 = trip({ households: { Klein: { arrive: "2027-07-17", depart: "2027-07-31" } } });
    const r = timeline(t2)!.rows.find(x => x.hh === "Klein")!;
    expect(r).toMatchObject({ a: "2027-07-17", d: "2027-07-31", src: "manual" });
    expect(timeline(t2)!.same).toBe(false);
  });
  it("eigene Zeiten setzen: Reisezeitraum wächst mit; zurücksetzen", () => {
    const t = trip();
    setPresence(t, "Oma", "2027-07-08", "2027-07-18");
    expect(t.from).toBe("2027-07-08");
    expect(t.households?.Oma).toMatchObject({ arrive: "2027-07-08", depart: "2027-07-18" });
    setPresence(t, "Oma", "2027-07-20", "2027-07-19");
    expect(t.households?.Oma?.arrive).toBe("2027-07-08");
    resetPresence(t, "Oma");
    expect(timeline(t)!.rows.find(x => x.hh === "Oma")!.src).toBe("trip");
  });
  it("Balken in Prozent der Leiste", () => {
    const tl = timeline(trip())!;
    expect(span(tl, "2027-07-10", "2027-07-31")).toEqual({ left: 0, width: 100 });
    const s = span(tl, "2027-07-17", "2027-07-24")!;
    expect(s.left).toBeCloseTo((7 / 21) * 100);
    expect(s.width).toBeCloseTo((7 / 21) * 100);
  });
  it("gesetzte Zeiten wirken auf die Rechnung: Unterkunft pro Nacht nach Anwesenden", () => {
    const t = trip({ items: [stay("2027-07-10", "2027-07-17", 100)] });
    setPresence(t, "Klein", "2027-07-17", "2027-07-31");
    setPresence(t, "Oma", "2027-07-17", "2027-07-31");
    const T = totals(t);
    // in der ersten Woche sind nur Bednorz da: die Unterkunft tragen sie allein
    const share = (hh: string) => T.byHousehold[hh] ?? 0;
    expect(share("Bednorz")).toBeCloseTo(700);
    expect(share("Klein")).toBe(0);
    // ab dem 17. sind alle da: zweite Unterkunft nach Personen (Bednorz 2 von 4)
    const t2 = trip({ items: [stay("2027-07-10", "2027-07-17", 100), stay("2027-07-17", "2027-07-24", 80)] });
    setPresence(t2, "Klein", "2027-07-17", "2027-07-31");
    setPresence(t2, "Oma", "2027-07-17", "2027-07-31");
    const T2 = totals(t2);
    expect(T2.byHousehold.Bednorz).toBeCloseTo(700 + 560 / 2);
    expect(T2.byHousehold.Oma).toBeCloseTo(560 / 4);
  });
  it("Aufteilung je Familie am Posten und in der Abrechnung (#229): Personen, Nächte von …, Betrag", () => {
    const t = trip({ items: [stay("2027-07-10", "2027-07-24", 80)] });
    setPresence(t, "Oma", "2027-07-17", "2027-07-24");
    const T = totals(t);
    const sh = itemShares(t, T.items["2027-07-10"]);
    expect(sh.map(x => [x.hh, x.persons, x.nights, x.of])).toEqual([["Bednorz", 2, 14, 14], ["Klein", 1, 14, 14], ["Oma", 1, 7, 14]]);
    // erste Woche 3 Personen, zweite 4: Oma zahlt 7 × 80 / 4
    expect(sh.find(x => x.hh === "Oma")!.v).toBeCloseTo(140);
    expect(sh.reduce((a, x) => a + x.v, 0)).toBeCloseTo(14 * 80);
    const line = householdShares(t, T).find(h => h.name === "Oma")!.cats.find(c => c.cat === "stay")!.lines[0];
    expect(line.nights).toBe("7 von 14 Nächten");
    expect(householdShares(t, T).find(h => h.name === "Klein")!.cats.find(c => c.cat === "stay")!.lines[0].nights).toBeUndefined();
  });
});
