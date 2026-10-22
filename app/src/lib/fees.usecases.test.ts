/*
 * Use Cases der automatischen Nebenkosten in der Rechnung: Kurtaxe je Stadt, Mietwagen (Kaution, junge Fahrer),
 * Umrechnung, wegklicken. Immer über calcItem, wie es die App rechnet.
 */
import { describe, expect, it } from "vitest";
import { calcItem, totals } from "./calc";
import { autoExtras, cityTaxFor, safeRate, youngDrivers } from "./fees";
import { DEFAULT_SETTINGS, type Item, type Option, type Traveler, type Trip } from "./model";

const P = (id: string, age: number | null, x: Partial<Traveler> = {}): Traveler => ({ id, name: id, age, household: "A", ...x });
const trip = (place: string, travelers: Traveler[], items: Item[] = []): Trip => ({
  id: "t", name: "T", place, country: "", travelers, items, tiers: {}, settings: { ...DEFAULT_SETTINGS, rates: { EUR: 1, CZK: 25, GBP: 0.85 } }
});
const opt = (price: Option["price"], x: Partial<Option> = {}): Option => ({ id: "o", label: "", price, ...x });
const stay = (o: Option, from: string, to: string, x: Partial<Item> = {}): Item => ({ id: "h", cat: "stay", name: "Hotel", status: "chosen", options: [o], from, to, ...x });
const family = () => [P("a", 40), P("b", 40), P("c", 10), P("d", 15)];

describe("Kurtaxe automatisch", () => {
  it("Split: 2 € pro Person und Nacht, Kinder bis 11 frei", () => {
    const tr = trip("Split", family(), [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }), "2027-07-01", "2027-07-08")]);
    const r = calcItem(tr.items[0], tr);
    expect(r.extras?.onsite).toBeCloseTo(3 * 7 * 2);
    expect(r.net).toBeCloseTo(700 + 42);
  });
  it("Rom: höchstens 10 Nächte, nach Sternen", () => {
    const tr = trip("Rom", [P("a", 40)], [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }, { stay: { stars: 4 } }), "2027-07-01", "2027-07-15")]);
    expect(calcItem(tr.items[0], tr).extras?.onsite).toBeCloseTo(10 * 7.5);
  });
  it("Prag: Kurtaxe in Kronen, Preis in Euro: umgerechnet", () => {
    const tr = trip("Prag", [P("a", 40)], [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }), "2027-07-01", "2027-07-03")]);
    expect(calcItem(tr.items[0], tr).extras?.onsite).toBeCloseTo(2 * 2);
  });
  it("Prag: Preis in Kronen, Kurtaxe bleibt in Kronen und wird einmal umgerechnet", () => {
    const tr = trip("Prag", [P("a", 40)], [stay(opt({ mode: "unit", currency: "CZK", unit: 2500 }), "2027-07-01", "2027-07-03")]);
    const r = calcItem(tr.items[0], tr);
    expect(r.base).toBeCloseTo(200);
    expect(r.extras?.onsite).toBeCloseTo(4);
  });
  it("Prozent-Kurtaxe (Berlin) vom Preis nach Rabatt", () => {
    const tr = trip("Berlin", [P("a", 40), P("b", 40)], [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }), "2027-07-01", "2027-07-03")]);
    tr.tiers.stay = [{ min: 2, pct: 10 }];
    expect(calcItem(tr.items[0], tr).extras?.onsite).toBeCloseTo(180 * 0.075);
  });
  it("Prozent-Kurtaxe mit Höchstnächten (Edinburgh, höchstens 5 Nächte) beachtet die Grenze (#499)", () => {
    const tr = trip("Edinburgh", [P("a", 40)], [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }), "2027-07-01", "2027-07-11")]);
    // 5 % von 5 Nächten à 100 €, nicht von allen 10
    expect(calcItem(tr.items[0], tr).extras?.onsite).toBeCloseTo(25);
  });
  it("Anbieter nennt eigene Kurtaxe: keine Schätzung dazu", () => {
    const o = opt({ mode: "unit", currency: "EUR", unit: 100 }, { extras: [{ id: "k", kind: "citytax", amount: 1, basis: "personNight", pay: "onsite" }] });
    const tr = trip("Split", [P("a", 40)], [stay(o, "2027-07-01", "2027-07-03")]);
    expect(calcItem(tr.items[0], tr).extras?.onsite).toBeCloseTo(2);
  });
  it("weggeklickt: zählt nicht, bleibt aber sichtbar", () => {
    const o = opt({ mode: "unit", currency: "EUR", unit: 100 }, { autoOff: ["auto:citytax:croatia"] });
    const tr = trip("Split", [P("a", 40)], [stay(o, "2027-07-01", "2027-07-03")]);
    const r = calcItem(tr.items[0], tr);
    expect(r.extras?.onsite || 0).toBe(0);
    expect(r.extras?.lines.length).toBe(1);
  });
  it("private Unterkunft: keine Kurtaxe", () => {
    const tr = trip("Split", [P("a", 40)], [stay(opt({ mode: "unit", currency: "EUR", unit: 0 }), "2027-07-01", "2027-07-03", { private: { place: "Split" } })]);
    expect(cityTaxFor(tr.items[0], tr.items[0].options[0], tr)).toBeNull();
  });
  it("nur für die Nächte, in denen jemand da ist", () => {
    const tr = trip("Split", [P("a", 40, { household: "A" }), P("b", 40, { household: "B" })], [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }), "2027-07-01", "2027-07-05")]);
    tr.households = { B: { arrive: "2027-07-03", depart: "2027-07-05" } };
    const r = calcItem(tr.items[0], tr);
    expect(r.extras?.onsite).toBeCloseTo((4 + 2) * 2);
    expect(r.per.b).toBeCloseTo(2 * 50 + 2 * 2);
    // b: 2 Nächte je 50 € (geteilt) und 2 Nächte Kurtaxe
  });
  it("Kurtaxe zählt in die Summe und als vor Ort", () => {
    const tr = trip("Split", [P("a", 40)], [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }), "2027-07-01", "2027-07-03")]);
    const T = totals(tr);
    expect(T.extras.onsite).toBeCloseTo(4);
    expect(T.extras.est).toBeCloseTo(4);
    expect(T.total).toBeCloseTo(204);
  });
});

describe("Mietwagen automatisch", () => {
  const car = (x: Partial<Item> = {}, o: Partial<Option> = {}): Item =>
    ({ id: "m", cat: "transport", name: "Mietwagen", hint: "rental", status: "chosen", options: [opt({ mode: "unit", currency: "EUR", unit: 40, qty: 7 }, o)], ...x });
  it("Kaution geschätzt, nie in den Kosten", () => {
    const tr = trip("", [P("a", 40)], [car()]);
    const T = totals(tr);
    expect(T.extras.deposit).toBe(800);
    expect(T.total).toBe(280);
  });
  it("junger Fahrer (22): Aufpreis je Tag", () => {
    const tr = trip("", [P("a", 22), P("b", 40)], [car()]);
    const r = calcItem(tr.items[0], tr);
    expect(youngDrivers(tr.items[0], tr).map(x => x.id)).toEqual(["a"]);
    expect(r.extras?.onsite).toBeCloseTo(12 * 7);
  });
  it("Grenzen junger Fahrer: 17 nein, 18 ja, 24 ja, 25 nein, ohne Alter nein", () => {
    const tr = trip("", [P("x17", 17), P("x18", 18), P("x24", 24), P("x25", 25), P("xn", null)], [car()]);
    expect(youngDrivers(tr.items[0], tr).map(x => x.id)).toEqual(["x18", "x24"]);
  });
  it("Vollschutz und Zusatzfahrer erst auf Wunsch", () => {
    const tr = trip("", [P("a", 40)], [car({}, { autoOn: ["auto:cover"] })]);
    expect(calcItem(tr.items[0], tr).extras?.onsite).toBeCloseTo(20 * 7);
  });
  it("eigene Kaution ersetzt die Schätzung", () => {
    const tr = trip("", [P("a", 40)], [car({}, { deposit: { amount: 300 } })]);
    expect(totals(tr).extras.deposit).toBe(300);
  });
  it("älterer Posten ohne Kennung, aber mit Auto-Symbol und Namen", () => {
    const it_: Item = { id: "m", cat: "transport", name: "Leihwagen Hertz", icon: "car", status: "chosen", options: [opt({ mode: "unit", currency: "EUR", unit: 40 })] };
    const tr = trip("", [P("a", 40)], [it_]);
    expect(totals(tr).extras.deposit).toBe(800);
  });
});

describe("Notkurse", () => {
  it("unbekannter Kurs (1) wird durch Notkurs ersetzt", () => {
    expect(safeRate(() => 1)("HUF")).toBe(400);
    expect(safeRate(() => 0)("HUF")).toBe(400);
    expect(safeRate(() => 1)("EUR")).toBe(1);
    expect(safeRate(() => 380)("HUF")).toBe(380);
    expect(safeRate(() => 1)("XYZ")).toBe(1);
  });
  it("Kurtaxe in Fremdwährung ohne geladene Kurse: kein unendlicher oder NaN-Betrag", () => {
    const tr = trip("Zürich", [P("a", 40)], [stay(opt({ mode: "unit", currency: "EUR", unit: 100 }), "2027-07-01", "2027-07-02")]);
    tr.settings.rates = { EUR: 1 };
    const ex = autoExtras(tr.items[0], tr.items[0].options[0], tr, () => 1);
    expect(ex[0].amount).toBeCloseTo(2.5 / 0.94);
  });
});
