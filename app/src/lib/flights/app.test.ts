import { describe, expect, it } from "vitest";
import fixture from "./kiwi.fixture.json";
import { fromKiwi } from "./kiwi";
import { worthRetry, compareRow, covered, withoutTravel, deadline, defaultFlyers, followFlight, defaultQuery, fmtMin, nearestAirports, offerToOption, passengers, rate, takeOffer } from "./app";
import { activeOption, totals } from "../calc";
import { presences } from "../calc";
import { DEFAULT_SETTINGS, type Trip } from "../model";

const trip = (): Trip => ({
  id: "t", name: "", place: "Split", country: "", from: "2027-07-18", to: "2027-07-29",
  travelers: [
    { id: "a", name: "Anna", age: 41, household: "Klein" },
    { id: "b", name: "Jonas", household: "Klein" },
    { id: "c", name: "Mia", age: 8, household: "Klein" },
    { id: "d", name: "Ben", age: 1, household: "Klein" },
    { id: "e", name: "Kind", household: "Klein", kind: "infant" },
    { id: "f", name: "Opa", household: "Klein", active: false }
  ],
  households: { Klein: { geo: { lat: 0, lon: 0, ort: "Düsseldorf" } } },
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
});

describe("Flugsuche in der App", () => {
  it("zählt Personen: Baby nur mit Alter unter 2, Kleinkind ohne Alter mit Sitz, Inaktive nicht", () => {
    expect(passengers(trip())).toEqual({ adults: 2, children: 2, infants: 1 });
    // Airline-Regeln, nicht die Altersgrenzen der Reise: 13 Jahre ist erwachsen, auch wenn die Reise erst ab 14 rechnet
    const t13 = trip(); t13.settings = { ...t13.settings, adultAge: 14 }; t13.travelers = [{ id: "a", name: "A", household: "X", age: 40 }, { id: "b", name: "B", household: "X", age: 13 }];
    expect(passengers(t13)).toEqual({ adults: 2, children: 0, infants: 0 });
    // zwei Babys, ein Erwachsener: nur eins auf dem Schoß, das andere braucht einen Sitz
    const twins = trip(); twins.travelers = [{ id: "a", name: "A", household: "X", age: 35 }, { id: "b", name: "B", household: "X", age: 0 }, { id: "c", name: "C", household: "X", age: 1 }];
    expect(passengers(twins)).toEqual({ adults: 1, children: 1, infants: 1 });
  });
  it("schlägt Wohnort, Ziel und Daten der Reise vor", () => {
    expect(defaultQuery(trip())).toMatchObject({ from: "Düsseldorf", to: "Split", depart: "2027-07-18", ret: "2027-07-29" });
    expect(defaultQuery(trip(), "DUS").from).toBe("DUS");
    // flexibel: Reisezeitraum als Fenster, 11 Nächte → 9 bis 11
    expect(defaultQuery(trip())).toMatchObject({ latest: "2027-07-29", nightsMin: 9, nightsMax: 11 });
    expect(defaultQuery({ ...trip(), from: undefined, to: undefined })).toMatchObject({ latest: "", nightsMin: 7, nightsMax: 14 });
    // kurze Reise: nicht auf 1 Nacht schrumpfen (3 Nächte → 2–3)
    expect(defaultQuery({ ...trip(), from: "2027-05-13", to: "2027-05-16" })).toMatchObject({ nightsMin: 2, nightsMax: 3 });
  });
  it("macht aus einem Treffer ein Angebot mit Quelle, Link und Hin- und Rückflug", () => {
    const o = offerToOption(fromKiwi(fixture)[0]);
    // Flugdauer aus der Suche bleibt am Flug (Abflug und Landung sind Ortszeiten)
    expect(o.legs![0].minutes).toBe(fromKiwi(fixture)[0].out.minutes);
    expect(o).toMatchObject({ label: "Eurowings ab DUS, direkt", price: { mode: "unit", unit: 989 }, source: { name: "Kiwi.com", url: "https://kiwi.com/u/uqukjx" } });
    expect(o.legs).toEqual([
      { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:05", carrier: "Eurowings", stops: 0, minutes: 115, toCity: "Split" },
      { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T14:25", arr: "2027-07-29T16:25", carrier: "Eurowings", stops: 0, minutes: 120, toCity: "Düsseldorf" }
    ]);
  });
  it("erster Treffer legt einen Posten an, weitere kommen als Angebote dazu; die Summe stimmt", () => {
    const t = trip();
    t.detail = { flights: true };
    const [a, b] = fromKiwi(fixture);
    const item = takeOffer(t, a);
    takeOffer(t, b, item.id);
    expect(t.items).toHaveLength(1);
    expect(item).toMatchObject({ cat: "flights", name: "Flug Düsseldorf – Split" });
    expect(item.options).toHaveLength(2);
    // ohne Wahl zählt das günstigste Angebot, dazu die Anreise zum Flughafen (hier ohne Wohnort-Entfernung 0)
    expect(totals(t).items[item.id].net).toBeGreaterThanOrEqual(989);
  });
  it("wählt die 4 nächsten Flughäfen zum Wohnort", () => {
    const t = trip();
    t.households = { Klein: { geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" } } };
    expect(nearestAirports(t)[0]).toBe("DUS");
    expect(nearestAirports(t)).toHaveLength(4);
    expect(nearestAirports({ ...t, households: {} })).toEqual(["DUS", "NRN", "CGN", "DTM"]);
  });
  it("rechnet Anfahrt und „zuhause ca.“ je Treffer; Vergleich je Flughafen", () => {
    const t = trip();
    t.households = { Klein: { geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" }, mode: "car" } };
    const [a, b] = fromKiwi(fixture);
    const r = rate(t, a, "DUS", true);
    expect(r.access).toBeGreaterThan(0);
    expect(r.total).toBe(989 + r.access);
    expect(r.nights).toBe(11);
    // Landung 29.07. 16:25, dazu Heimfahrt und 45 min Gepäck
    expect(r.home).toBeGreaterThan(deadline("2027-07-29", "16:25"));
    expect(r.home).toBeLessThan(deadline("2027-07-29", "18:30"));
    expect(fmtMin(deadline("2027-07-29", "18:10"))).toBe("Do 29.07. 18:10");
    expect(rate(t, a, "DUS", false).total).toBe(989);
    const row = compareRow("DUS", [r, rate(t, b, "DUS", true)]);
    expect(row).toMatchObject({ code: "DUS", price: 989, count: 2, direct: r.total });
    expect(compareRow("CGN", [], "Kiwi antwortet mit 503")).toMatchObject({ count: 0, error: "Kiwi antwortet mit 503" });
  });
});

/** zwei Familien wie im Artefakt: Klein aus Düsseldorf, Hase aus München */
const two = (): Trip => ({
  ...trip(),
  travelers: [
    { id: "a", name: "Anna", age: 41, household: "Klein" }, { id: "c", name: "Mia", age: 8, household: "Klein" },
    { id: "h", name: "Hanna", age: 38, household: "Hase" }, { id: "i", name: "Ida", age: 5, household: "Hase" }, { id: "j", name: "Jan", age: 40, household: "Hase" }
  ],
  households: { Klein: { geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" }, mode: "car" }, Hase: { geo: { lat: 48.14, lon: 11.58, ort: "München" }, mode: "car" } }
});

describe("Flüge je Familie oder Person (wie im Artefakt)", () => {
  it("zählt nur, wer fliegt", () => {
    expect(passengers(two(), ["h", "i", "j"])).toEqual({ adults: 2, children: 1, infants: 0 });
    expect(defaultQuery(two(), "", ["h", "i", "j"])).toMatchObject({ from: "München", adults: 2, children: 1 });
  });
  it("Vorschlag: erste Familie ohne Flug; eine Familie oder alle versorgt: alle", () => {
    const t = two();
    expect(defaultFlyers(t)).toEqual(["a", "c"]);
    t.items.push({ id: "f1", cat: "flights", name: "Flug Klein", status: "idea", participants: ["a", "c"], options: [] });
    expect([...covered(t)]).toEqual(["a", "c"]);
    expect(defaultFlyers(t)).toEqual(["h", "i", "j"]);
    t.items.push({ id: "f2", cat: "flights", name: "Flug Hase", status: "idea", participants: ["h", "i", "j"], options: [] });
    expect(defaultFlyers(t)).toBeUndefined();
    expect(defaultFlyers(trip())).toBeUndefined();
  });
  it("Flughäfen: je Familie die nächsten zum Wohnort", () => {
    expect(nearestAirports(two(), 4, ["h", "i", "j"])[0]).toBe("MUC");
    const both = nearestAirports(two(), 4);
    expect(both).toContain("DUS");
    expect(both).toContain("MUC");
  });
  it("Anfahrt nur für die Familien, die fliegen", () => {
    const [o] = fromKiwi(fixture);
    const all = rate(two(), o, "DUS", true), klein = rate(two(), o, "DUS", true, ["a", "c"]);
    expect(klein.access).toBeGreaterThan(0);
    expect(klein.access).toBeLessThan(all.access);
  });
  it("Übernehmen: Posten nur für die Fliegenden, Name „Flug Klein“; weitere Treffer als Angebote dazu", () => {
    const t = two();
    const [a, b] = fromKiwi(fixture);
    const it = takeOffer(t, a, undefined, ["a", "c"]);
    expect(it).toMatchObject({ name: "Flug Klein", participants: ["a", "c"] });
    takeOffer(t, b, it.id, ["a", "c"]);
    expect(it.options).toHaveLength(2);
    expect(takeOffer(t, a, undefined, ["a", "c", "h", "i", "j"]).participants).toBeUndefined();
    expect(takeOffer(t, a, undefined, ["a", "h"]).name).toBe("Flug Düsseldorf – Split");
  });
  it("mitfliegen wie im Artefakt: gleicher Flug, Preis pro Person, eigene Anfahrt, Anwesenheit folgt", () => {
    const t = two();
    const [a, b] = fromKiwi(fixture);
    const klein = takeOffer(t, a, undefined, ["a", "c"]);
    const hase = followFlight(t, klein.id, ["h", "i", "j"]);
    expect(hase).toMatchObject({ name: "Flug Hase", follow: klein.id, participants: ["h", "i", "j"] });
    const o = activeOption(hase, t)!;
    // 989 € für Klein (2 Personen) → 494,50 € pro Person
    expect(o.price).toMatchObject({ mode: "person", adult: 494.5 });
    expect(o.legs?.find(l => l.dir === "out")?.from).toBe("DUS");
    const T = totals(t);
    // 3 × 494,50 € plus Anfahrt von München nach Düsseldorf
    expect(T.items[hase.id].net).toBeGreaterThan(3 * 494.5);
    expect(T.items[hase.id].access?.lines.map(l => l.hh)).toEqual(["Hase"]);
    expect(presences(t).h).toMatchObject({ a: "2027-07-18", d: "2027-07-29", src: "flight" });
    // eigener Flug übernommen: fliegt ab jetzt selbst
    takeOffer(t, b, hase.id, ["h", "i", "j"]);
    expect(hase.follow).toBeUndefined();
    expect(hase.options).toHaveLength(1);
    expect(activeOption(hase, t)?.price.mode).toBe("unit");
  });
});

describe("Flugsuche wiederholen", () => {
  const src = (p: object) => ({ id: "kiwi", name: "Kiwi.com", configured: true, ok: false, count: 0, ...p });
  it("nur ohne Angebote und wenn eine Quelle nach einer Weile gescheitert ist", () => {
    expect(worthRetry({ offers: [], sources: [src({ ms: 8000, error: "keine Antwort nach 25 s" })] } as never)).toBe(true);
    // sofortige Absage (fehlende Flughafencodes) ändert sich beim zweiten Versuch nicht
    expect(worthRetry({ offers: [], sources: [src({ id: "travelpayouts", ms: 0, error: "braucht Flughafencodes" })] } as never)).toBe(false);
    // keine Flüge, aber alle Quellen haben geantwortet
    expect(worthRetry({ offers: [], sources: [src({ ok: true, ms: 3000 })] } as never)).toBe(false);
    expect(worthRetry({ offers: [{}], sources: [src({ ms: 8000 })] } as never)).toBe(false);
  });

  it("zeigt, wer noch keinen Flug und keine Anreise hat (Babys fliegen mit, ohne Plan kein Hinweis)", () => {
    const tr = trip();
    expect(withoutTravel(tr)).toEqual([]);
    tr.items.push({ id: "f", cat: "flights", name: "Flug", status: "idea", participants: ["a", "b"], options: [] });
    // Mia (8) und das Kleinkind ohne Alter fehlen; Ben (1) fliegt auf dem Schoß, Opa ist nicht dabei
    expect(withoutTravel(tr).map(t => t.id)).toEqual(["c", "e"]);
    tr.items.push({ id: "auto", cat: "transport", name: "Anreise Auto", status: "idea", arrival: true, participants: ["c"], options: [] });
    expect(withoutTravel(tr).map(t => t.id)).toEqual(["e"]);
    // verworfener Flug zählt nicht
    tr.items[0].status = "dropped";
    expect(withoutTravel(tr).map(t => t.id)).toEqual(["a", "b", "e"]);
    expect(covered(tr).has("c")).toBe(true);
  });
});

describe("Flugdauer über Zeitzonen", () => {
  it("nimmt die Dauer aus der Suche statt der Differenz der Ortszeiten", async () => {
    const { legDuration } = await import("../format");
    // Düsseldorf 10:00 → New York 12:30 Ortszeit sind 8 h 30 min
    expect(legDuration({ dep: "2027-07-18T10:00", arr: "2027-07-18T12:30", minutes: 510 })).toBe("8 h 30 min");
    expect(legDuration({ dep: "2027-07-18T10:00", arr: "2027-07-18T12:30" })).toBe("2 h 30 min");
  });
});
