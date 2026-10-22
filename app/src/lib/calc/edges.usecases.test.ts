/*
 * Use Cases rund um Daten, Anwesenheit, Nebenkosten und Wechselkurse: Grenzfälle, die im Alltag vorkommen
 * (Nachtflug, Jahreswechsel, Kinder frei, fehlende Kurse).
 */
import { describe, expect, it } from "vitest";
import { addDays, airNights, dayDiff, flightLegs, needs, nightsList, okDate, presenceOf, stopsOf, parkOf, trainPP } from "./travel";
import { calcExtras } from "./extras";
import { addMonth, daysBetween, monthGrid, pickDay } from "../daterange";
import { convert, inCurrency, parseEcb } from "../fx";
import { DEFAULT_SETTINGS, type Extra, type FlightLeg, type Item, type Option, type Traveler, type Trip } from "../model";

const P = (id: string, age: number | null, household = "A", x: Partial<Traveler> = {}): Traveler => ({ id, name: id, age, household, ...x });
const trip = (travelers: Traveler[], items: Item[] = [], x: Partial<Trip> = {}): Trip => ({
  id: "t", name: "T", place: "", country: "", travelers, items, tiers: {}, settings: { ...DEFAULT_SETTINGS }, ...x
});
const leg = (dir: FlightLeg["dir"], from: string, to: string, dep: string, arr: string): FlightLeg => ({ dir, from, to, dep, arr });
const flight = (id: string, legs: FlightLeg[], x: Partial<Item> = {}): Item =>
  ({ id, cat: "flights", name: id, status: "chosen", options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 100 }, legs }], ...x });
const pick = (it: Item) => it.options[0] || null;

describe("Daten", () => {
  it("Nächte: leer bei fehlendem oder umgekehrtem Zeitraum", () => {
    expect(nightsList("2027-07-05", "2027-07-01")).toEqual([]);
    expect(nightsList("2027-07-05", "2027-07-05")).toEqual([]);
    expect(nightsList(undefined, "2027-07-05")).toEqual([]);
    expect(nightsList("kaputt", "2027-07-05")).toEqual([]);
  });
  it("Nächte mit Uhrzeit im Datum", () => {
    expect(nightsList("2027-07-01T15:00", "2027-07-03T10:00")).toEqual(["2027-07-01", "2027-07-02"]);
  });
  it("Sommerzeit-Umstellung verschiebt keine Nacht", () => {
    expect(nightsList("2027-03-27", "2027-03-30")).toEqual(["2027-03-27", "2027-03-28", "2027-03-29"]);
    expect(nightsList("2027-10-30", "2027-11-01")).toEqual(["2027-10-30", "2027-10-31"]);
  });
  it("sehr langer Zeitraum ist begrenzt (400 Nächte)", () => {
    expect(nightsList("2027-01-01", "2030-01-01").length).toBe(400);
  });
  it("addDays und dayDiff über Schaltjahr", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(dayDiff("2028-01-01", "2029-01-01")).toBe(366);
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
  it("okDate", () => {
    expect(okDate("2027-02-30")).toBe(true); // JS rollt auf März, gilt als Datum
    expect(okDate("27-02-01")).toBe(false);
    expect(okDate("")).toBe(false);
    expect(okDate("2027-13-01")).toBe(false);
  });
  it("Kalender: Tipp-Logik wie bei Airbnb", () => {
    let s = pickDay({ from: "", to: "" }, "2027-07-10", "from");
    expect(s).toMatchObject({ from: "2027-07-10", to: "", picking: "to", done: false });
    s = pickDay(s, "2027-07-05", "to"); // vor dem Anfang: neu beginnen
    expect(s).toMatchObject({ from: "2027-07-05", done: false });
    s = pickDay(s, "2027-07-05", "to"); // gleicher Tag: nur mit sameDay
    expect(s.done).toBe(false);
    expect(pickDay({ from: "2027-07-05", to: "" }, "2027-07-05", "to", true).done).toBe(true);
    expect(pickDay({ from: "2027-07-05", to: "" }, "2027-07-12", "to")).toMatchObject({ from: "2027-07-05", to: "2027-07-12", done: true });
  });
  it("Monatsraster: Montag zuerst, Februar im Schaltjahr", () => {
    const g = monthGrid("2028-02");
    expect(g.filter(Boolean).length).toBe(29);
    expect(g.indexOf("2028-02-01")).toBe(1); // 1.2.2028 ist ein Dienstag
    expect(monthGrid("2027-11").indexOf("2027-11-01")).toBe(0); // Montag
    expect(monthGrid("2027-08").indexOf("2027-08-01")).toBe(6); // Sonntag
  });
  it("Monat verschieben über Jahresgrenzen", () => {
    expect(addMonth("2027-12", 1)).toBe("2028-01");
    expect(addMonth("2027-01", -1)).toBe("2026-12");
    expect(addMonth("2027-05", 24)).toBe("2029-05");
  });
  it("Tage zwischen zwei Daten", () => {
    expect(daysBetween("2027-03-27", "2027-03-29")).toBe(2);
    expect(daysBetween("2027-07-10", "2027-07-01")).toBe(-9);
  });
});

describe("Anwesenheit aus Flügen", () => {
  const out = leg("out", "DUS", "SPU", "2027-07-01T06:00", "2027-07-01T08:30");
  const back = leg("back", "SPU", "DUS", "2027-07-08T20:00", "2027-07-08T22:30");
  it("Hin- und Rückflug ergeben erste Nacht und Abreisetag", () => {
    const tr = trip([P("a", 30)], [flight("f", [out, back])]);
    expect(presenceOf(tr.travelers[0], tr, pick)).toEqual({ a: "2027-07-01", d: "2027-07-08", src: "flight" });
  });
  it("Nachtflug: Landung am nächsten Tag, erste Nacht ist die nach der Landung", () => {
    const night = leg("out", "FRA", "BKK", "2027-07-01T22:00", "2027-07-02T14:00");
    const tr = trip([P("a", 30)], [flight("f", [night, back])]);
    expect(presenceOf(tr.travelers[0], tr, pick)?.a).toBe("2027-07-02");
    expect([...airNights(tr.travelers[0], tr, pick)]).toEqual(["2027-07-01"]);
  });
  it("eigene Daten der Familie gehen vor", () => {
    const tr = trip([P("a", 30)], [flight("f", [out, back])], { households: { A: { arrive: "2027-07-03", depart: "2027-07-05" } } });
    expect(presenceOf(tr.travelers[0], tr, pick)?.src).toBe("manual");
  });
  it("eigene Daten verkehrt herum werden ignoriert", () => {
    const tr = trip([P("a", 30)], [flight("f", [out, back])], { households: { A: { arrive: "2027-07-05", depart: "2027-07-03" } } });
    expect(presenceOf(tr.travelers[0], tr, pick)?.src).toBe("flight");
  });
  it("nur Hinflug: Anwesenheit unbekannt, zählt für alle Nächte", () => {
    const tr = trip([P("a", 30)], [flight("f", [out])]);
    const p = presenceOf(tr.travelers[0], tr, pick);
    expect(p).toBeNull();
    expect(needs(p, "2027-07-04")).toBe(true);
  });
  it("Hin und Rück in getrennten Posten, eigener Flug geht vor dem für alle", () => {
    const late = leg("out", "DUS", "SPU", "2027-07-03T06:00", "2027-07-03T08:30");
    const tr = trip([P("a", 30), P("b", 30)], [flight("alle", [out]), flight("rueck", [back]), flight("spaet", [late], { participants: ["b"] })]);
    expect(flightLegs(tr.travelers[0], tr, pick).out?.dep).toBe(out.dep);
    // b hat einen eigenen Hinflug, aber keinen eigenen Rückflug
    const lb = flightLegs(tr.travelers[1], tr, pick);
    expect(lb.out?.dep).toBe(late.dep);
    expect(lb.back).toBeUndefined();
  });
  it("verworfener Flug zählt nicht", () => {
    const tr = trip([P("a", 30)], [flight("f", [out, back], { status: "dropped" })]);
    expect(presenceOf(tr.travelers[0], tr, pick)).toBeNull();
  });
  it("Rundreise: Station je Stadt mit Übernachtung", () => {
    const via = { ...leg("via", "SPU", "DBV", "2027-07-04T10:00", "2027-07-04T11:00"), toCity: "Dubrovnik" };
    const tr = trip([P("a", 30)], [flight("f", [out, via, back])]);
    expect(stopsOf(tr.travelers[0], tr, pick)).toEqual([
      { ap: "SPU", from: "2027-07-01", to: "2027-07-04" },
      { ap: "DBV", city: "Dubrovnik", from: "2027-07-04", to: "2027-07-08" }
    ]);
  });
  it("Umstieg am selben Tag ist keine Station", () => {
    const a = leg("out", "DUS", "IST", "2027-07-01T06:00", "2027-07-01T10:00");
    const b = leg("via", "IST", "BKK", "2027-07-01T13:00", "2027-07-02T03:00");
    const tr = trip([P("a", 30)], [flight("f", [a, b, back])]);
    expect(stopsOf(tr.travelers[0], tr, pick).map(s => s.ap)).toEqual(["BKK"]);
  });
});

describe("Anreise zum Flughafen", () => {
  it("Bahnpreis: mindestens 10 €, höchstens 160 €, in 5-€-Schritten", () => {
    expect(trainPP(0)).toBe(10);
    expect(trainPP(10000)).toBe(160);
    expect(trainPP(100) % 5).toBe(0);
  });
  it("Parken: entfällt, gebucht, Richtwert", () => {
    expect(parkOf({ parking: { off: true } }, 10, 7, 1)).toEqual({ v: 0, booked: false });
    expect(parkOf({ parking: { paid: 0 } }, 10, 7, 1)).toEqual({ v: 0, booked: true });
    expect(parkOf({}, 10, 7, 2)).toEqual({ v: 140, booked: false });
  });
});

describe("Nebenkosten", () => {
  const people = [P("a", 40), P("b", 40), P("c", 10), P("d", 3)];
  const opt = (extras: Extra[], x: Partial<Option> = {}): Option => ({ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 400 }, extras, ...x });
  const ctx = (x: object = {}) => ({ nights: 4, days: 5, basePer: { a: 100, b: 100, c: 100, d: 100 }, fx: 1, settings: DEFAULT_SETTINGS, ...x });
  const X = (x: Partial<Extra>): Extra => ({ id: "x", kind: "other", amount: 0, basis: "booking", pay: "onsite", ...x });

  it("Kurtaxe pro Person und Nacht, Kinder bis 12 frei", () => {
    const r = calcExtras(opt([X({ kind: "citytax", amount: 2, basis: "personNight", freeUpTo: 12 })]), people, ctx());
    expect(r.onsite).toBe(2 * 4 * 2);
    expect(r.lines[0].payers).toBe(2);
  });
  it("Kurtaxe höchstens 7 Nächte", () => {
    const r = calcExtras(opt([X({ amount: 1, basis: "personNight", max: 7 })]), people, ctx({ nights: 14 }));
    expect(r.onsite).toBe(4 * 7);
  });
  it("Kurtaxe nach Nächten je Person (nicht alle bleiben gleich lang)", () => {
    const r = calcExtras(opt([X({ amount: 1, basis: "personNight" })]), people, ctx({ w: { a: 4, b: 4, c: 2, d: 0 } }));
    expect(r.onsite).toBe(10);
    expect(r.per.d).toBeUndefined();
  });
  it("Endreinigung einmal, nach Nächten gewichtet", () => {
    const r = calcExtras(opt([X({ kind: "cleaning", amount: 80 })]), people, ctx({ w: { a: 4, b: 4, c: 0, d: 0 } }));
    expect(r.per).toEqual({ a: 40, b: 40, c: 0, d: 0 });
  });
  it("Prozent vom Preis", () => {
    const r = calcExtras(opt([X({ amount: 10, basis: "percent", pay: "extra" })]), people, ctx());
    expect(r.extra).toBeCloseTo(40);
  });
  it("im Preis enthalten zählt nicht dazu, weggeklickt gar nicht", () => {
    const r = calcExtras(opt([X({ amount: 50, pay: "included" }), X({ id: "y", amount: 30, off: true })]), people, ctx());
    expect(r.added).toBe(0);
    expect(r.included).toBe(50);
  });
  it("Gebühr je Buchung mal Einheiten, höchstens maxUnits", () => {
    const r = calcExtras(opt([X({ amount: 10, maxUnits: 2 })]), people, ctx({ units: 3 }));
    expect(r.onsite).toBe(20);
  });
  it("Fremdwährung wird umgerechnet, Kaution separat", () => {
    const r = calcExtras(opt([X({ amount: 100 })], { deposit: { amount: 1000 } }), people, ctx({ fx: 0.5 }));
    expect(r.onsite).toBe(50);
    expect(r.deposit).toBe(500);
    expect(r.added).toBe(50);
  });
  it("Kinder ohne Alter (Platzhalter) frei, wenn die Grenze das Kindesalter abdeckt", () => {
    const r = calcExtras(opt([X({ amount: 1, basis: "person", freeUpTo: 11 })]), [P("k", null, "A", { kind: "child" }), P("e", null)], ctx());
    expect(r.lines[0].payers).toBe(1);
  });
  it("ohne Personen keine Nebenkosten, Kaution bleibt", () => {
    const r = calcExtras(opt([X({ amount: 10 })], { deposit: { amount: 300 } }), [], ctx());
    expect(r.added).toBe(0);
    expect(r.deposit).toBe(300);
  });
  it("Anteile ergeben die Summe", () => {
    const r = calcExtras(opt([X({ amount: 7, basis: "night" }), X({ id: "y", amount: 3, basis: "personDay", pay: "extra" }), X({ id: "z", amount: 5, basis: "percent" })]), people, ctx());
    expect(Object.values(r.per).reduce((a, b) => a + b, 0)).toBeCloseTo(r.added);
  });
});

describe("Wechselkurse", () => {
  const xml = `<Cube time='2026-10-01'><Cube currency='USD' rate='1.1000'/><Cube currency='GBP' rate='0.85'/><Cube currency='XXX' rate='0'/></Cube>`;
  it("EZB-Kurse lesen, ungültige Kurse fallen weg", () => {
    const r = parseEcb(xml);
    expect(r.date).toBe("2026-10-01");
    expect(r.rates).toEqual({ EUR: 1, USD: 1.1, GBP: 0.85 });
  });
  it("Kreuzkurs ohne Euro", () => {
    expect(convert(85, "GBP", "USD", parseEcb(xml))).toBeCloseTo(110);
    expect(convert(10, "USD", "USD", null)).toBe(10);
    expect(convert(10, "CHF", "EUR", parseEcb(xml))).toBeNull();
  });
  it("Angebote ohne Kurs fallen weg, Originalpreis bleibt dabei", () => {
    const l = inCurrency([{ currency: "GBP", price: 85 }, { currency: "CHF", price: 10 }, { currency: "EUR", price: 7 }], "price", "EUR", parseEcb(xml));
    expect(l).toEqual([{ currency: "EUR", price: 100, orig: { amount: 85, currency: "GBP" } }, { currency: "EUR", price: 7 }]);
  });
  it("leere oder kaputte Antwort", () => {
    expect(parseEcb("").rates).toEqual({ EUR: 1 });
    expect(parseEcb("<html>Fehler</html>").date).toBe("");
  });
});
