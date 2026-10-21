/*
 * Use Cases des Rechenkerns: typische Reisen von Anfang bis Ende, dazu Grenzfälle und Invarianten
 * (Anteile ergeben die Summe, Familien ergeben den Eigenanteil). Zufallsreisen mit festem Startwert.
 */
import { describe, expect, it } from "vitest";
import { activeOption, applyFunds, calcItem, householdShares, itemShares, parseNum, totals } from "./index";
import { DEFAULT_SETTINGS, type Fund, type Item, type Option, type Traveler, type Trip } from "../model";

const P = (id: string, age: number | null, household: string, x: Partial<Traveler> = {}): Traveler => ({ id, name: id, age, household, ...x });
const trip = (travelers: Traveler[], items: Item[] = [], x: Partial<Trip> = {}): Trip => ({
  id: "t", name: "T", place: "Testort", country: "ZZ", travelers, items, tiers: {},
  settings: { ...DEFAULT_SETTINGS, rates: { EUR: 1, USD: 1.1, GBP: 0.85, HRK: 7.5, JPY: 160 } }, ...x
});
const opt = (id: string, price: Option["price"], x: Partial<Option> = {}): Option => ({ id, label: id, price, ...x });
const item = (id: string, cat: Item["cat"], options: Option[], x: Partial<Item> = {}): Item => ({ id, cat, name: id, status: "chosen", options, ...x });
const pp = (adult: number, x: Partial<Option["price"]> = {}): Option["price"] => ({ mode: "person", currency: "EUR", adult, ...x });
const unit = (u: number, x: Partial<Option["price"]> = {}): Option["price"] => ({ mode: "unit", currency: "EUR", unit: u, ...x });
const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

/** zwei Familien und ein Single: Klein (2 Erw., Kind 8, Baby 1), Hase (2 Erw.), Solo (1 Erw.) */
const crew = () => [
  P("a", 40, "Klein"), P("b", 38, "Klein"), P("c", 8, "Klein"), P("d", 1, "Klein"),
  P("e", 30, "Hase"), P("f", 31, "Hase"),
  P("g", 25, "Solo")
];

describe("Use Case: Familienurlaub komplett", () => {
  const t = () => trip(crew(), [
    item("flug", "flights", [opt("fr", pp(200, { child: 150, infant: 30 })), opt("ew", pp(260))], { status: "booked", chosen: "fr" }),
    item("fewo", "stay", [opt("o", unit(140, { qty: 7 }))], { status: "paid" }),
    item("auto", "transport", [opt("o", unit(40, { qty: 7 }))]),
    item("krka", "attractions", [opt("o", pp(40, { child: 20, infant: 0 }))], { participants: ["a", "b", "c", "d"] }),
    item("boot", "attractions", [opt("o", pp(60))], { status: "dropped" })
  ], { detail: { flights: true, stay: true, transport: true, attractions: true } });

  it("Summe aus allen Posten, verworfene zählen nicht", () => {
    const T = totals(t());
    // 5 Erwachsene, ein Kind, ein Baby
    const flug = 5 * 200 + 150 + 30, fewo = 980, auto = 280, krka = 2 * 40 + 20;
    expect(T.total).toBeCloseTo(flug + fewo + auto + krka);
    expect(T.byCat.attractions).toBeCloseTo(krka);
    expect(T.fixed).toBeCloseTo(flug + fewo);
    expect(T.open).toBeCloseTo(auto + krka);
    expect(T.paid).toBeCloseTo(fewo);
  });
  it("Personen ergeben die Summe, Familien den Eigenanteil", () => {
    const T = totals(t());
    expect(sum(T.byPerson)).toBeCloseTo(T.total);
    expect(sum(T.byHousehold)).toBeCloseTo(T.due);
    expect(Object.keys(T.byHousehold).sort()).toEqual(["Hase", "Klein", "Solo"]);
  });
  it("Abrechnung je Familie stimmt mit den Summen überein", () => {
    const tr = t(), T = totals(tr);
    const hs = householdShares(tr, T);
    expect(hs.map(h => h.name)).toEqual(["Klein", "Hase", "Solo"]);
    expect(hs.reduce((a, h) => a + h.total, 0)).toBeCloseTo(T.due);
    for (const h of hs) {
      expect(h.total).toBeCloseTo(T.byHousehold[h.name]);
      expect(h.fixed + h.open).toBeCloseTo(h.costs);
      expect(h.members.reduce((a, m) => a + m.v, 0)).toBeCloseTo(h.total);
    }
  });
  it.fails("kleine Posten (unter 50 Cent je Familie) fehlen in der Abrechnung je Familie (#502)", () => {
    // 1 € Toilette für alle 7: je Familie unter 50 Cent, die Familienkarten ergeben dann nicht mehr die Summe
    const tr = t(); tr.items.push(item("wc", "misc", [opt("o", unit(1))]));
    tr.detail = { ...tr.detail, misc: true };
    const T = totals(tr);
    expect(householdShares(tr, T).reduce((a, h) => a + h.total, 0)).toBeCloseTo(T.due);
  });
  it("Aufteilung eines Postens auf Familien ergibt den Posten", () => {
    const tr = t(), T = totals(tr);
    for (const id of ["flug", "fewo", "auto", "krka"]) {
      const sh = itemShares(tr, T.items[id]);
      expect(sh.reduce((a, s) => a + s.v, 0)).toBeCloseTo(T.items[id].net);
    }
    expect(itemShares(tr, T.items.boot)).toEqual([]);
    expect(itemShares(tr, T.items.krka).map(s => s.hh)).toEqual(["Klein"]);
  });
  it("Wechsel der Wahl ändert nur den Flug", () => {
    const tr = t(); const before = totals(tr).total;
    tr.items[0].chosen = "ew";
    expect(totals(tr).total - before).toBeCloseTo(7 * 260 - (5 * 200 + 150 + 30));
  });
});

describe("Use Case: Personen kommen und gehen", () => {
  it("wer nicht dabei ist (active: false), zahlt nirgends mit", () => {
    const tr = trip([P("a", 30, "A"), P("b", 30, "B", { active: false })], [item("x", "misc", [opt("o", unit(100))])], { detail: { misc: true } });
    const T = totals(tr);
    expect(T.byPerson.a).toBe(100);
    expect(T.byPerson.b).toBe(0);
    expect(T.byHousehold.B).toBeUndefined();
    expect(T.active).toBe(1);
  });
  it("Teilnehmer, der nicht mehr in der Reise steht, wird ignoriert", () => {
    const tr = trip([P("a", 30, "A")], [item("x", "misc", [opt("o", unit(100))], { participants: ["a", "weg"] })], { detail: { misc: true } });
    const r = calcItem(tr.items[0], tr);
    expect(r.n).toBe(1);
    expect(r.per).toEqual({ a: 100 });
  });
  it("Posten, bei dem keiner mehr mitmacht, kostet nichts (Pauschale)", () => {
    const tr = trip([P("a", 30, "A", { active: false })], [item("x", "misc", [opt("o", unit(100))])], { detail: { misc: true } });
    const T = totals(tr);
    expect(T.items.x.net).toBe(0);
    expect(T.total).toBe(0);
  });
  it("leere Teilnehmerliste heißt: niemand", () => {
    const tr = trip(crew(), [item("x", "misc", [opt("o", pp(10))], { participants: [] })], { detail: { misc: true } });
    expect(calcItem(tr.items[0], tr).net).toBe(0);
  });
  it("leerer Haushalt landet bei „Ohne Haushalt“, Leerzeichen zählen nicht", () => {
    const tr = trip([P("a", 30, ""), P("b", 30, "  "), P("c", 30, " Hase ")], [item("x", "misc", [opt("o", unit(90))])], { detail: { misc: true } });
    const T = totals(tr);
    expect(T.byHousehold["Ohne Haushalt"]).toBeCloseTo(60);
    expect(T.byHousehold.Hase).toBeCloseTo(30);
    expect(householdShares(tr, T).map(h => h.name)).toEqual(["Ohne Haushalt", "Hase"]);
  });
});

describe("Use Case: Alter und Preise", () => {
  const ages = [P("x12", 12, "A"), P("x11", 11, "A"), P("x2", 2, "A"), P("x0", 0, "A")];
  it("Altersgrenzen genau auf der Grenze", () => {
    const r = calcItem(item("x", "misc", [opt("o", pp(100, { child: 50, infant: 10 }))]), trip(ages));
    expect(r.per).toEqual({ x12: 100, x11: 50, x2: 50, x0: 10 });
  });
  it("eigene Altersgrenzen der Reise (z. B. Kind bis 15)", () => {
    const tr = trip(ages); tr.settings.adultAge = 16; tr.settings.childAge = 4;
    const r = calcItem(item("x", "misc", [opt("o", pp(100, { child: 50, infant: 10 }))]), tr);
    expect(r.per).toEqual({ x12: 50, x11: 50, x2: 10, x0: 10 });
  });
  it("Kleinkindpreis 0 wird beachtet (nicht als „fehlt“ gelesen)", () => {
    const r = calcItem(item("x", "misc", [opt("o", pp(100, { infant: 0 }))]), trip(ages));
    expect(r.per.x0).toBe(0);
  });
  it("Kinderpreis 0, ohne Kleinkindpreis: Kleinkind zahlt auch 0", () => {
    const r = calcItem(item("x", "misc", [opt("o", pp(100, { child: 0 }))]), trip(ages));
    expect(r.per).toEqual({ x12: 100, x11: 0, x2: 0, x0: 0 });
  });
  it("Platzhalter ohne Alter mit Klasse Kind zahlt Kinderpreis", () => {
    const r = calcItem(item("x", "misc", [opt("o", pp(100, { child: 50 }))]), trip([P("k", null, "A", { kind: "child" })]));
    expect(r.per.k).toBe(50);
  });
  it("Alter als leerer Text (aus Formular) gilt als unbekannt", () => {
    const r = calcItem(item("x", "misc", [opt("o", pp(100, { child: 50 }))]), trip([P("k", "" as unknown as number, "A")]));
    expect(r.per.k).toBe(100);
  });
});

describe("Use Case: Pauschalen und Einheiten", () => {
  it("7 Personen, Kapazität 4, multiply: 2 Zimmer", () => {
    const r = calcItem(item("x", "stay", [opt("o", unit(100, { capacity: 4, multiply: true }))]), trip(crew()));
    expect(r.units).toBe(2);
    expect(r.net).toBe(200);
    expect(sum(r.per)).toBeCloseTo(200);
  });
  it("genau Kapazität: eine Einheit", () => {
    const r = calcItem(item("x", "stay", [opt("o", unit(100, { capacity: 7, multiply: true }))]), trip(crew()));
    expect(r.units).toBe(1);
  });
  it("Pauschale mit Rabatt: Anteile ergeben net", () => {
    const tr = trip(crew()); tr.tiers.misc = [{ min: 5, pct: 15 }];
    const r = calcItem(item("x", "misc", [opt("o", unit(700))]), tr);
    expect(r.net).toBeCloseTo(595);
    expect(sum(r.per)).toBeCloseTo(r.net);
    expect(r.saved).toBeCloseTo(105);
  });
  it("Rabatt-Stufe knapp nicht erreicht", () => {
    const tr = trip(crew()); tr.tiers.misc = [{ min: 8, pct: 15 }];
    expect(calcItem(item("x", "misc", [opt("o", unit(700))]), tr).saved).toBe(0);
  });
  it("Rabatt zählt Beteiligte, nicht alle Reisenden", () => {
    const tr = trip(crew()); tr.tiers.misc = [{ min: 3, pct: 10 }];
    expect(calcItem(item("x", "misc", [opt("o", pp(10))], { participants: ["a", "b"] }), tr).saved).toBe(0);
  });
});

describe("Use Case: Fremdwährung", () => {
  it("eigener Kurs der Reise schlägt den Tageskurs", () => {
    const tr = trip([P("a", 30, "A")]);
    expect(calcItem(item("x", "misc", [opt("o", { ...unit(110), currency: "USD" })]), tr).net).toBeCloseTo(100);
  });
  it("Yen-Preis mit Menge", () => {
    const tr = trip([P("a", 30, "A"), P("b", 30, "A")]);
    expect(calcItem(item("x", "misc", [opt("o", { ...pp(1600, { qty: 2 }), currency: "JPY" })]), tr).net).toBeCloseTo(40);
  });
  it("günstigstes Angebot über Währungen hinweg (nach Euro, nicht nach Zahl)", () => {
    const tr = trip([P("a", 30, "A")]);
    const it_ = item("x", "misc", [opt("eur", unit(50)), opt("jpy", { ...unit(6400), currency: "JPY" })]);
    expect(activeOption(it_, tr)?.id).toBe("jpy");
  });
});

describe("Use Case: Unterkunft mit Zeitraum und Anreise", () => {
  // Familie A die ganze Woche, Familie B nur die zweite Hälfte (eigene Daten)
  const tr = (price: Option["price"]) => trip([P("a", 30, "A"), P("b", 30, "A"), P("c", 30, "B"), P("d", 30, "B")],
    [item("h", "stay", [opt("o", price)], { from: "2027-07-01", to: "2027-07-07" })],
    { households: { B: { arrive: "2027-07-04", depart: "2027-07-07" } }, detail: { stay: true } });

  it("Pauschale je Nacht nur auf die Anwesenden", () => {
    const r = calcItem(tr(unit(120)).items[0], tr(unit(120)));
    expect(r.net).toBeCloseTo(720);
    // Nächte 1–3: nur A (2 Pers.) → je 180; Nächte 4–6: alle 4 → je 90
    expect(r.per.a).toBeCloseTo(270);
    expect(r.per.c).toBeCloseTo(90);
    expect(sum(r.per)).toBeCloseTo(720);
    expect(r.stay?.w).toEqual({ a: 6, b: 6, c: 3, d: 3 });
  });
  it("Preis pro Person und Nacht", () => {
    const x = tr(pp(30));
    const r = calcItem(x.items[0], x);
    expect(r.net).toBeCloseTo(2 * 6 * 30 + 2 * 3 * 30);
  });
  it("Preis für den ganzen Aufenthalt (basis stay)", () => {
    const x = tr(unit(600, { basis: "stay" }));
    const r = calcItem(x.items[0], x);
    expect(r.net).toBeCloseTo(600);
    expect(sum(r.per)).toBeCloseTo(600);
  });
  it("Belegung über Kapazität wird gemeldet", () => {
    const x = tr(unit(120, { capacity: 3 }));
    const r = calcItem(x.items[0], x);
    expect(r.stay?.maxOcc).toBe(4);
    expect(r.stay?.over).toBe(true);
  });
  it("niemand laut Daten da: mit allen gerechnet, nicht still 0 €", () => {
    const x = trip([P("a", 30, "A")], [item("h", "stay", [opt("o", unit(100))], { from: "2027-08-01", to: "2027-08-03" })],
      { households: { A: { arrive: "2027-07-01", depart: "2027-07-05" } } });
    const r = calcItem(x.items[0], x);
    expect(r.net).toBe(200);
    expect(r.stay?.nobody).toBe(true);
  });
  it("Abreise vor Anreise (Tippfehler) wird ignoriert", () => {
    const x = trip([P("a", 30, "A")], [item("h", "stay", [opt("o", unit(100))], { from: "2027-08-03", to: "2027-08-01" })]);
    // ohne gültigen Zeitraum wie ein normaler Posten
    expect(calcItem(x.items[0], x).net).toBe(100);
  });
  it("Zeitraum über Monats- und Jahreswechsel", () => {
    const x = trip([P("a", 30, "A")], [item("h", "stay", [opt("o", unit(100))], { from: "2027-12-30", to: "2028-01-02" })]);
    expect(calcItem(x.items[0], x).stay?.nights).toEqual(["2027-12-30", "2027-12-31", "2028-01-01"]);
  });
  it("Schaltjahr: 28.2. bis 1.3.", () => {
    const x = trip([P("a", 30, "A")], [item("h", "stay", [opt("o", unit(100))], { from: "2028-02-28", to: "2028-03-01" })]);
    expect(calcItem(x.items[0], x).net).toBe(200);
  });
  it("Rabatt in Unterkunft mit Zeitraum: Anteile ergeben net", () => {
    const x = tr(unit(120)); x.tiers.stay = [{ min: 4, pct: 10 }];
    const r = calcItem(x.items[0], x);
    expect(r.net).toBeCloseTo(648);
    expect(sum(r.per)).toBeCloseTo(648);
  });
});

describe("Use Case: Mitfliegen", () => {
  it("folgt dem Flug der anderen Familie, Preis je Person", () => {
    const tr = trip([P("a", 30, "A"), P("b", 30, "B")], [
      item("f1", "flights", [opt("o", pp(200))], { participants: ["a"], access: false }),
      item("f2", "flights", [], { participants: ["b"], follow: "f1", access: false })
    ], { detail: { flights: true } });
    const T = totals(tr);
    expect(T.items.f2.net).toBe(200);
    expect(T.total).toBe(400);
  });
  it("folgt einer Pauschale: Anteil je Mitfliegendem", () => {
    const tr = trip([P("a", 30, "A"), P("b", 30, "A"), P("c", 30, "B")], [
      item("f1", "flights", [opt("o", unit(300))], { participants: ["a", "b"], access: false }),
      item("f2", "flights", [], { participants: ["c"], follow: "f1", access: false })
    ]);
    expect(totals(tr).items.f2.net).toBe(150);
  });
  it("Kette (folgt einem, der selbst folgt) zählt nicht als Mitfliegen", () => {
    const tr = trip([P("a", 30, "A")], [
      item("f1", "flights", [opt("o", pp(100))], { access: false }),
      item("f2", "flights", [], { follow: "f1", access: false }),
      item("f3", "flights", [], { follow: "f2", access: false })
    ]);
    expect(calcItem(tr.items[2], tr).net).toBe(0);
  });
  it("folgt sich selbst: kein Absturz", () => {
    const tr = trip([P("a", 30, "A")], [item("f1", "flights", [opt("o", pp(100))], { follow: "f1", access: false })]);
    expect(calcItem(tr.items[0], tr).net).toBe(100);
  });
  it("folgt einem verworfenen Flug: kostet nichts", () => {
    const tr = trip([P("a", 30, "A")], [
      item("f1", "flights", [opt("o", pp(100))], { status: "dropped", access: false }),
      item("f2", "flights", [], { follow: "f1", access: false })
    ]);
    expect(calcItem(tr.items[1], tr).net).toBe(0);
  });
});

describe("Use Case: einfacher Modus", () => {
  it("Betrag je Bereich gleich auf alle Aktiven", () => {
    const tr = trip(crew(), [], { simple: { stay: 700, misc: 70 } });
    const T = totals(tr);
    expect(T.total).toBe(770);
    expect(T.byPerson.a).toBeCloseTo(110);
    expect(T.byHousehold.Klein).toBeCloseTo(440);
    expect(T.open).toBe(770);
  });
  it("negativer Betrag wird nicht abgezogen", () => {
    expect(totals(trip(crew(), [], { simple: { stay: -100 } })).total).toBe(0);
  });
  it("einzelne Einträge nur auf die Gewählten", () => {
    const tr = trip(crew(), [], { lines: [{ id: "l", cat: "misc", label: "Taxi", amount: 60, who: ["e", "f"] }] } as Partial<Trip>);
    const T = totals(tr);
    expect(T.byHousehold.Hase).toBeCloseTo(60);
    expect(T.byHousehold.Klein).toBeCloseTo(0);
  });
  it("Posten in einfachem Bereich bleiben, zählen aber nicht", () => {
    const tr = trip(crew(), [item("x", "misc", [opt("o", unit(500))])], { detail: { misc: false }, simple: { misc: 70 } });
    const T = totals(tr);
    expect(T.total).toBe(70);
    expect(T.items.x.counts).toBe(false);
  });
  it("Abrechnung je Familie mit einfachen Beträgen und Einträgen", () => {
    const tr = trip(crew(), [], { simple: { stay: 700 }, lines: [{ id: "l", cat: "misc", label: "Taxi", amount: 60, who: ["e", "f"] }] } as Partial<Trip>);
    const T = totals(tr);
    const hs = householdShares(tr, T);
    for (const h of hs) expect(h.total).toBeCloseTo(T.byHousehold[h.name]);
  });
});

describe("Use Case: Zuschüsse", () => {
  const base = () => trip(crew(), [item("x", "misc", [opt("o", pp(100))])], { detail: { misc: true } });
  it("Zuschuss größer als Kosten: Überschuss bleibt stehen", () => {
    const tr = base(); tr.funds = [{ id: "f", name: "Oma", amount: 1000 }];
    const T = totals(tr);
    expect(T.funds).toBeCloseTo(700);
    expect(T.fundUse.f.surplus).toBeCloseTo(300);
    expect(T.due).toBeCloseTo(0);
  });
  it("Zuschuss nur für Kinder, gleich je Person", () => {
    const tr = base(); tr.funds = [{ id: "f", name: "Oma", amount: 150, for: ["c", "d"] }];
    const T = totals(tr);
    expect(T.fundBy.c).toBeCloseTo(75);
    expect(T.fundBy.d).toBeCloseTo(75);
    expect(T.fundBy.a).toBeUndefined();
    expect(T.fundUse.f.surplus).toBeCloseTo(0);
  });
  it("Zuschuss für einen Bereich ohne Kosten dort: alles Überschuss", () => {
    const tr = base(); tr.funds = [{ id: "f", name: "Bus", amount: 200, cat: "transport" }];
    expect(totals(tr).fundUse.f.surplus).toBeCloseTo(200);
  });
  it("nach Anteil verteilt", () => {
    const tr = trip([P("a", 30, "A"), P("b", 30, "B")], [item("x", "misc", [opt("o", pp(100))], { participants: ["a"] }), item("y", "misc", [opt("o", pp(300))], { participants: ["b"] })]);
    tr.funds = [{ id: "f", name: "K", amount: 200, split: "share" }];
    const T = totals(tr);
    expect(T.fundBy.a).toBeCloseTo(50);
    expect(T.fundBy.b).toBeCloseTo(150);
  });
  it("zwei Zuschüsse nacheinander: der zweite bekommt nur, was noch offen ist", () => {
    const tr = base(); tr.funds = [{ id: "f1", name: "A", amount: 600 }, { id: "f2", name: "B", amount: 600 }];
    const T = totals(tr);
    expect(T.funds).toBeCloseTo(700);
    expect(T.fundUse.f2.applied).toBeCloseTo(100);
  });
  it("Zuschuss für jemanden, der nicht dabei ist: alles Überschuss", () => {
    const tr = base(); tr.travelers[6].active = false; tr.funds = [{ id: "f", name: "x", amount: 50, for: ["g"] }];
    expect(totals(tr).fundUse.f.surplus).toBe(50);
  });
  it("negativer Zuschuss zählt nicht", () => {
    const tr = base(); tr.funds = [{ id: "f", name: "x", amount: -50 }];
    expect(totals(tr).due).toBeCloseTo(700);
  });
  it("Zuschüsse je Familie ergeben die Summe", () => {
    const tr = base(); tr.funds = [{ id: "f1", name: "A", amount: 333, received: true }, { id: "f2", name: "B", amount: 77, split: "share" }];
    const T = totals(tr), hs = householdShares(tr, T);
    expect(hs.flatMap(h => h.funds).reduce((a, f) => a + f.v, 0)).toBeCloseTo(T.funds);
    expect(T.fundsReceived).toBeCloseTo(333);
  });
  it("gleich je Person mit sehr vielen Personen und kleinem Rest (Schleifengrenze)", () => {
    // 60 Personen, jede hat andere Kosten: die Verteilung braucht viele Runden
    const ts = Array.from({ length: 60 }, (_, i) => P("p" + i, 30, "H" + i));
    const byPerson: Record<string, number> = {};
    ts.forEach((x, i) => (byPerson[x.id] = i + 1));
    const total = sum(byPerson);
    const f = applyFunds([{ id: "f", name: "", amount: total - 1 } as Fund], ts, byPerson, {});
    expect(f.total).toBeCloseTo(total - 1, 1);
  });
});

describe("Use Case: Bezahlt und Anzahlung", () => {
  it("Anzahlung höher als Preis: bezahlt höchstens der Preis", () => {
    const tr = trip([P("a", 30, "A")], [item("x", "misc", [opt("o", unit(100))], { status: "booked", payments: [{ amount: 150 }] })]);
    expect(totals(tr).paid).toBe(100);
  });
  it("bezahlt mit Kurtaxe vor Ort: vor Ort gilt noch nicht als bezahlt", () => {
    const o = opt("o", unit(100), { extras: [{ id: "k", kind: "citytax", amount: 2, basis: "personNight", pay: "onsite" }] });
    const tr = trip([P("a", 30, "A")], [item("h", "stay", [o], { status: "paid", from: "2027-01-01", to: "2027-01-04" })]);
    const T = totals(tr);
    expect(T.items.h.net).toBeCloseTo(306);
    expect(T.paid).toBeCloseTo(300);
    expect(T.extras.onsite).toBeCloseTo(6);
  });
  it("Kaution zählt nie zu den Kosten", () => {
    const o = opt("o", unit(100), { deposit: { amount: 500 } });
    const tr = trip([P("a", 30, "A")], [item("x", "transport", [o])]);
    const T = totals(tr);
    expect(T.total).toBe(100);
    expect(T.extras.deposit).toBe(500);
  });
});

describe("Use Case: Zahleneingabe", () => {
  it.each([
    ["1.234,56", 1234.56], ["1234,56", 1234.56], ["1234.56", 1234.56], ["0,5", 0.5], [",5", 0.5],
    ["  42  ", 42], ["42 €", 42], ["€42", 42], ["1.000.000", 1000000], ["1 000", 1000], ["-12,5", -12.5],
    [7, 7], ["0", 0]
  ])("%s → %s", (s, v) => expect(parseNum(s)).toBeCloseTo(v as number));
  it.each([[""], ["abc"], [null], [undefined], ["€"]])("%s → NaN", s => expect(parseNum(s)).toBeNaN());
  it.fails("englisch mit Tausenderkomma: 1,234.56 (#503)", () => expect(parseNum("1,234.56")).toBeCloseTo(1234.56));
  it.fails("Tausenderkomma ohne Nachkomma: 1,234,567 (#503)", () => expect(parseNum("1,234,567")).toBe(1234567));
});

/* ---------- Invarianten mit Zufallsreisen ---------- */

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
function randomTrip(seed: number): Trip {
  const r = rng(seed), pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const hhs = ["A", "B", "C", "D"];
  const travelers = Array.from({ length: 1 + Math.floor(r() * 9) }, (_, i) =>
    P("p" + i, r() < 0.1 ? null : Math.floor(r() * 70), pick(hhs), { active: r() > 0.1, ...(r() < 0.1 ? { kind: "child" as const } : {}) }));
  const ids = travelers.map(x => x.id);
  const cats: Item["cat"][] = ["flights", "stay", "transport", "attractions", "misc"];
  const items: Item[] = Array.from({ length: Math.floor(r() * 8) }, (_, i) => {
    const cat = pick(cats);
    const options = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, j) => {
      const cur = pick(["EUR", "EUR", "USD", "JPY"]);
      const price: Option["price"] = r() < 0.5
        ? { mode: "unit", currency: cur, unit: Math.round(r() * 1000), qty: 1 + Math.floor(r() * 3), capacity: Math.floor(r() * 4), multiply: r() < 0.5, ...(r() < 0.3 ? { basis: "stay" as const } : {}) }
        : { mode: "person", currency: cur, adult: Math.round(r() * 300), ...(r() < 0.5 ? { child: Math.round(r() * 100) } : {}), ...(r() < 0.3 ? { infant: 0 } : {}) };
      return opt("o" + j, price);
    });
    const parts = r() < 0.4 ? ids.filter(() => r() < 0.6) : undefined;
    const stay = cat === "stay" && r() < 0.6 ? { from: "2027-07-0" + (1 + Math.floor(r() * 3)), to: "2027-07-0" + (5 + Math.floor(r() * 4)) } : {};
    return item("i" + i, cat, options, { status: pick(["idea", "chosen", "booked", "paid", "dropped"] as const), ...(parts ? { participants: parts } : {}), ...stay, access: false,
      ...(r() < 0.3 ? { payments: [{ amount: Math.round(r() * 300) }] } : {}) });
  });
  const households = r() < 0.5 ? { [pick(hhs)]: { arrive: "2027-07-03", depart: "2027-07-06" } } : undefined;
  const funds: Fund[] = r() < 0.5 ? [{ id: "f1", name: "x", amount: Math.round(r() * 2000), ...(r() < 0.5 ? { split: "share" as const } : {}), ...(r() < 0.3 ? { cat: pick(cats) } : {}), ...(r() < 0.3 ? { for: ids.filter(() => r() < 0.5) } : {}) }] : [];
  const tiers = r() < 0.3 ? { [pick(cats)]: [{ min: 2, pct: 10 }] } : {};
  return trip(travelers, items, { households, funds, tiers, simple: r() < 0.3 ? { misc: Math.round(r() * 500) } : undefined });
}

describe("Invarianten über 300 Zufallsreisen", () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);
  it("Anteile je Posten ergeben den Postenbetrag", () => {
    for (const s of seeds) {
      const tr = randomTrip(s), T = totals(tr);
      for (const it_ of tr.items) {
        const r = T.items[it_.id];
        expect(sum(r.per), `Reise ${s}, Posten ${it_.id}`).toBeCloseTo(r.net, 4);
      }
    }
  });
  it("Personen ergeben die Summe (bei mindestens einer aktiven Person)", () => {
    for (const s of seeds) {
      const tr = randomTrip(s); if (!tr.travelers.some(x => x.active !== false)) continue;
      const T = totals(tr);
      expect(sum(T.byPerson), `Reise ${s}`).toBeCloseTo(T.total, 4);
    }
  });
  it("Familien ergeben den Eigenanteil, Abrechnung passt dazu", () => {
    for (const s of seeds) {
      const tr = randomTrip(s); if (!tr.travelers.some(x => x.active !== false)) continue;
      const T = totals(tr);
      expect(sum(T.byHousehold), `Reise ${s}`).toBeCloseTo(T.due, 4);
      // Zeilen unter 50 Cent zeigt die Abrechnung nicht (#502), daher höchstens 0,50 € je Posten Abweichung
      for (const h of householdShares(tr, T)) expect(Math.abs(h.total - T.byHousehold[h.name]), `Reise ${s}, ${h.name}`).toBeLessThanOrEqual(0.5 * tr.items.length + 0.01);
    }
  });
  it("nichts ist negativ, Zuschüsse höchstens Kosten, fest + offen = Summe", () => {
    for (const s of seeds) {
      const tr = randomTrip(s), T = totals(tr);
      expect(T.total).toBeGreaterThanOrEqual(0);
      expect(T.funds).toBeLessThanOrEqual(T.total + 1e-6);
      expect(T.fixed + T.open).toBeCloseTo(T.total);
      expect(T.paid).toBeLessThanOrEqual(T.total + 1e-6);
      for (const id in T.byPerson) expect(T.byPerson[id], `Reise ${s}, ${id}`).toBeGreaterThanOrEqual(-1e-9);
      for (const id in T.fundBy) expect(T.fundBy[id]).toBeLessThanOrEqual((T.byPerson[id] || 0) + 1e-6);
    }
  });
  it("keine NaN oder Infinity", () => {
    for (const s of seeds) {
      const T = totals(randomTrip(s));
      for (const v of [T.total, T.due, T.funds, T.paid, T.saved, ...Object.values(T.byPerson), ...Object.values(T.byHousehold)])
        expect(Number.isFinite(v), `Reise ${s}`).toBe(true);
    }
  });
});
