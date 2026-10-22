import { afterEach, describe, expect, it } from "vitest";
import { cabinsTotal, cruiseTitle, newCruise, portTime, routeLine, suggestCabins, syncCruise, withoutCabin } from "./cruise";
import { calcItem, totals } from "./calc";
import { syncTips } from "./fees";
import { DEFAULT_SETTINGS, type Item, type Traveler, type Trip } from "./model";

const P = (id: string, household: string, age = 40): Traveler => ({ id, name: id, age, household });
const trip = (travelers: Traveler[]): Trip => ({
  id: "t", name: "Kreuzfahrt", place: "Barcelona", country: "ES", from: "2027-06-05", to: "2027-06-12",
  travelers, items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
});
// Familie Klein (2), Familie Hase (4 mit Kindern), Oma allein
const group = () => trip([P("a", "Klein"), P("b", "Klein"), P("c", "Hase"), P("d", "Hase"), P("e", "Hase", 8), P("f", "Hase", 5), P("o", "Oma", 70)]);

describe("Kabinen vorschlagen", () => {
  it("je Familie eine Kabine", () => {
    const cs = suggestCabins(group().travelers);
    expect(cs.map(c => c.who)).toEqual([["a", "b"], ["c", "d", "e", "f"], ["o"]]);
  });
  it("große Familie gleichmäßig auf Kabinen mit höchstens 4", () => {
    const t = trip(["1", "2", "3", "4", "5"].map(id => P(id, "Groß")));
    expect(suggestCabins(t.travelers).map(c => c.who.length)).toEqual([3, 2]);
  });
});

describe("Kreuzfahrt abgleichen", () => {
  it("neu: Zeitraum der Reise, Kabinen nach Familien, alle dabei", () => {
    const t = group(), it0 = newCruise(t, "EUR");
    expect(it0.cat).toBe("stay");
    expect([it0.from, it0.to]).toEqual(["2027-06-05", "2027-06-12"]);
    expect(it0.options[0].cabins).toHaveLength(3);
    expect(it0.participants).toHaveLength(7);
    expect(withoutCabin(it0.options[0], t)).toEqual([]);
  });
  it("Zeitraum aus erstem und letztem Hafen, Preis = Summe der Kabinen, Teilnehmende aus Kabinen", () => {
    const t = group(), it0 = newCruise(t, "EUR");
    it0.cruise!.ports = [{ date: "2027-07-01", place: "Genua" }, { date: "2027-07-02", sea: true }, { date: "2027-07-08", place: "Genua" }];
    const cs = it0.options[0].cabins!;
    cs[0].price = 2000; cs[1].price = 700; cs[1].per = "person"; cs[2].price = 900;
    cs.pop();
    syncCruise(it0);
    expect([it0.from, it0.to]).toEqual(["2027-07-01", "2027-07-08"]);
    expect(it0.options[0].price.unit).toBe(2000 + 4 * 700);
    expect(cabinsTotal(cs)).toBe(4800);
    expect(it0.participants).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(withoutCabin(it0.options[0], t).map(x => x.id)).toEqual(["o"]);
  });
});

describe("Kosten je Kabine", () => {
  // ohne Trinkgeld (eigene Tests in tips.test.ts)
  afterEach(() => syncTips(true, undefined));
  const priced = (t: Trip): Item => {
    syncTips(false, undefined);
    const it0 = newCruise(t, "EUR");
    const cs = it0.options[0].cabins!;
    cs[0].price = 2380; cs[1].price = 2960; cs[2].price = 1540;
    it0.status = "chosen";
    syncCruise(it0);
    return it0;
  };
  it("jede Familie zahlt ihre Kabine, Summe stimmt", () => {
    const t = group(), it0 = priced(t);
    t.items.push(it0);
    const r = calcItem(it0, t);
    expect(r.net).toBeCloseTo(2380 + 2960 + 1540);
    expect(r.per.a).toBeCloseTo(1190);
    expect(r.per.e).toBeCloseTo(740);
    expect(r.stay?.nights).toHaveLength(7);
    const T = totals(t);
    expect(T.byHousehold.Klein).toBeCloseTo(2380);
    expect(T.byHousehold.Hase).toBeCloseTo(2960);
    expect(T.byHousehold.Oma).toBeCloseTo(1540);
  });
  it("Oma mit Enkel in einer Kabine: nach Personen geteilt", () => {
    const t = group(), it0 = priced(t);
    const cs = it0.options[0].cabins!;
    cs[1].who = ["c", "d", "e"]; cs[2].who = ["o", "f"];
    syncCruise(it0);
    t.items.push(it0);
    const T = totals(t);
    expect(T.byHousehold.Hase).toBeCloseTo(2960 + 770);
    expect(T.byHousehold.Oma).toBeCloseTo(770);
  });
  it("Fremdwährung wird umgerechnet", () => {
    const t = group(), it0 = priced(t);
    t.settings.rates = { EUR: 1, USD: 2 };
    it0.options[0].price.currency = "USD";
    expect(calcItem(it0, t).net).toBeCloseTo((2380 + 2960 + 1540) / 2);
  });
});

describe("Anzeige", () => {
  it("Route ohne Seetage und doppelte Häfen", () => {
    const it0 = newCruise(group(), "EUR");
    it0.cruise!.ports = [{ date: "1", place: "Barcelona" }, { date: "2", sea: true }, { date: "3", place: "Palermo" }, { date: "4", place: "Palermo" }, { date: "5", place: "Barcelona" }];
    expect(routeLine(it0)).toBe("Barcelona → Palermo → Barcelona");
  });
  it("Überschrift: eigener Name, sonst ab dem ersten Hafen", () => {
    const it0 = newCruise(group(), "EUR");
    expect(cruiseTitle(it0)).toBe("Neue Kreuzfahrt");
    it0.cruise!.ports[0].place = "Genua";
    expect(cruiseTitle(it0)).toBe("Kreuzfahrt ab Genua");
    it0.name = "Nordland 2027";
    expect(cruiseTitle(it0)).toBe("Nordland 2027");
  });
  it("Liegezeit kurz", () => {
    expect(portTime({ date: "", arr: "08:00", dep: "17:30" })).toEqual({ arr: "8", dep: "17:30" });
    expect(portTime({ date: "" })).toEqual({});
  });
});
