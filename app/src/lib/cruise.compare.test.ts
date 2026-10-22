import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";
import { cruiseFacts, newCruise, optRoute, syncCruise } from "./cruise";
import { addAsOption } from "./cruises/app";

const trip = (): Trip => ({ id: "t", name: "R", place: "", country: "", items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS },
  from: "2027-05-10", to: "2027-05-17", travelers: [{ id: "a", name: "A", household: "X" }, { id: "b", name: "B", household: "X" }] });

function two(tr: Trip): Item {
  const a = newCruise(tr, "EUR");
  a.cruise = { line: "L1", ship: "S1", ports: [{ date: "2027-05-10", place: "Barcelona" }, { date: "2027-05-11", sea: true }, { date: "2027-05-12", place: "Rom" }, { date: "2027-05-17", place: "Barcelona" }] };
  syncCruise(a);
  const b = newCruise(tr, "EUR");
  b.cruise = { line: "L2", ship: "S2", ports: [{ date: "2027-05-12", place: "Savona" }, { date: "2027-05-14", place: "Palma" }, { date: "2027-05-15", place: "Marseille" }, { date: "2027-05-19", place: "Savona" }] };
  syncCruise(b);
  addAsOption(a, b);
  return a;
}

describe("Kreuzfahrten vergleichen (#520): Route je Angebot", () => {
  it("anderes Angebot gewählt: Route, Zeitraum und Schiff wechseln, zurück wieder die erste", () => {
    const it = two(trip());
    expect(it.options.length).toBe(2);
    const [a, b] = it.options;
    expect(it.cruise).toMatchObject({ ship: "S1", opt: a.id });
    expect(optRoute(it, b).ship).toBe("S2");
    it.chosen = b.id;
    syncCruise(it);
    expect(it.cruise).toMatchObject({ line: "L2", ship: "S2", opt: b.id });
    expect([it.from, it.to]).toEqual(["2027-05-12", "2027-05-19"]);
    expect(a.cruise?.ship).toBe("S1");
    it.chosen = a.id;
    syncCruise(it);
    expect(it.cruise!.ports.map(p => p.place || "~")).toEqual(["Barcelona", "~", "Rom", "Barcelona"]);
    expect([it.from, it.to]).toEqual(["2027-05-10", "2027-05-17"]);
  });
  it("Änderungen an der Route bleiben beim Angebot, auch nach dem Wechsel", () => {
    const it = two(trip());
    it.cruise!.ports[2].place = "Neapel";
    it.chosen = it.options[1].id;
    syncCruise(it);
    it.chosen = it.options[0].id;
    syncCruise(it);
    expect(it.cruise!.ports[2].place).toBe("Neapel");
  });
  it("Eckdaten: Nächte, Häfen ohne Ein- und Ausschiffung, Seetage, Route", () => {
    const it = two(trip());
    expect(cruiseFacts(it, it.options[0])).toMatchObject({ ship: "S1", nights: 7, harbours: 1, sea: 1, route: "Barcelona → Rom → Barcelona" });
    expect(cruiseFacts(it, it.options[1])).toMatchObject({ ship: "S2", nights: 7, harbours: 2, sea: 0, first: "Savona", last: "Savona" });
  });
  it("alte Kreuzfahrt ohne Route je Angebot: Wechsel behält die Route", () => {
    const tr = trip();
    const it = newCruise(tr, "EUR");
    it.cruise!.ports = [{ date: "2027-05-10", place: "Kiel" }, { date: "2027-05-14", place: "Kiel" }];
    it.options.push({ ...JSON.parse(JSON.stringify(it.options[0])), id: "o2" });
    it.chosen = "o2";
    syncCruise(it);
    expect(it.cruise!.ports.map(p => p.place)).toEqual(["Kiel", "Kiel"]);
  });
});
