import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncTips } from "../fees";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { totals } from "../calc";
import { importToTrip } from "./apply";
import type { ImportedOffer } from "./ai";

// Trinkgeld (#517) aus: hier geht es um andere Beträge (eigene Tests in tips.test.ts)
beforeAll(() => syncTips(false));
afterAll(() => syncTips(true));

const AT = "2026-10-20T12:00:00.000Z";
const blank = (): Trip => ({ id: "t", name: "Neue Reise", autoName: true, place: "", country: "", travelers: [{ id: "p", name: "Fuchs", household: "Fuchs", kind: "adult", placeholder: true }], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } });

const pkg: ImportedOffer = {
  kind: "package", title: "Mallorca im Mai", provider: "Reiseanbieter", url: "https://example.com/deal", place: "Playa de Palma", country: "ES",
  from: "2027-05-10", to: "2027-05-17", adults: 4, price: { total: 796, currency: "EUR" },
  flights: { legs: [{ dir: "out", from: "DUS", to: "PMI", dep: "2027-05-10T06:10", arr: "2027-05-10T08:25", carrier: "Airline" }, { dir: "back", from: "PMI", to: "DUS", dep: "2027-05-17T21:40" }], baggage: { cabin: 1, checked: 0 } },
  stay: { name: "Hotel Sol", stars: 3, board: "breakfast", boards: [{ board: "breakfast", extra: 0 }, { board: "half", extra: 18 }] },
  transfer: { included: true },
  extras: [{ kind: "citytax", amount: 2, basis: "personNight", pay: "onsite" }, { kind: "bag", amount: 35, basis: "person", pay: "extra" }]
};

describe("Angebot → Reise (#457)", () => {
  it("Gruppe ohne Namensliste: jede Person ein eigenes Tier, Familie teilt eins", () => {
    const g = blank();
    importToTrip(g, { ...pkg, adults: 6, partyKind: "group" }, AT);
    expect(new Set(g.travelers.map(p => p.household)).size).toBe(6);
    const f = blank();
    importToTrip(f, { ...pkg, adults: 2, childAges: [5], partyKind: "family" }, AT);
    expect(new Set(f.travelers.map(p => p.household)).size).toBe(1);
  });

  it("Pauschalreise: Paketpreis an der Unterkunft, Flug im Paket, Transfer zu 0 €, Nebenkosten am passenden Teil", () => {
    const trip = blank();
    const items = importToTrip(trip, pkg, AT);
    expect(trip).toMatchObject({ name: "Mallorca im Mai", autoName: false, place: "Playa de Palma", country: "ES", from: "2027-05-10", to: "2027-05-17", ai: { at: AT } });
    expect(trip.travelers.length).toBe(4);
    expect(trip.travelers.every(p => p.placeholder && p.kind === "adult")).toBe(true);
    expect(items.map(i => i.cat)).toEqual(["flights", "stay", "transport"]);
    const [fl, st, tr] = items;
    expect(fl.options[0]).toMatchObject({ label: "Airline", price: { mode: "unit", unit: 0 }, source: { name: "Reiseanbieter", url: "https://example.com/deal", imported: true }, baggage: { personal: 4, cabin: 4, checked: 0 } });
    expect(fl.options[0].legs?.map(l => [l.dir, l.from, l.to, l.dep])).toEqual([["out", "DUS", "PMI", "2027-05-10T06:10"], ["back", "PMI", "DUS", "2027-05-17T21:40"]]);
    expect(fl.options[0].extras?.map(x => x.kind)).toEqual(["bag"]);
    expect(st).toMatchObject({ name: "Hotel Sol", from: "2027-05-10", to: "2027-05-17", ai: { kind: "imported" } });
    expect(st.options[0]).toMatchObject({ price: { mode: "unit", basis: "stay", unit: 796, capacity: 4 }, stay: { stars: 3, board: "breakfast", boards: [{ board: "breakfast", extra: 0 }, { board: "half", extra: 18 }] } });
    expect(st.options[0].extras?.map(x => [x.kind, x.pay])).toEqual([["citytax", "onsite"]]);
    expect(tr.options[0].price.unit).toBe(0);
    expect(tr.hint).toBe("transfer");
    // Paketpreis zählt genau einmal
    const T = totals(trip);
    // am Flug nur Gepäck (4 × 35 €) und die Anreise zum Flughafen
    expect(T.items[fl.id].gross - 140).toBeLessThan(100);
    // Paketpreis plus Kurtaxe vor Ort (2 € × 7 Nächte × 4)
    expect(T.items[st.id].gross).toBe(796 + 56);
  });
  it("nur Flug: Preis am Flug, keine Unterkunft; Preis pro Person mal Reisende", () => {
    const trip = blank();
    const items = importToTrip(trip, { kind: "flight", adults: 2, price: { perPerson: 99 }, flights: { legs: [{ dir: "out", from: "DUS", to: "BCN", dep: "2027-03-01T07:00" }] } }, AT);
    expect(items.map(i => i.cat)).toEqual(["flights"]);
    expect(items[0].options[0].price.unit).toBe(198);
    expect(trip.from).toBe("2027-03-01");
    expect(trip.autoName).toBe(true);
  });
  it("Teilnehmerliste: Namen und Alter, ohne Familie in einer Tierfamilie; eingetragene Reisende bleiben", () => {
    const trip = blank();
    importToTrip(trip, { kind: "other", travelers: [{ name: "Anna", household: "Berg", age: 9 }, { name: "Ben", household: "Berg" }, { name: "Cem" }, { name: "Dana" }] }, AT);
    expect(trip.travelers.map(p => [p.name, p.household === "Berg", p.age ?? p.kind])).toEqual([["Anna", true, 9], ["Ben", true, "adult"], ["Cem", false, "adult"], ["Dana", false, "adult"]]);
    expect(trip.travelers[2].household).toBe(trip.travelers[3].household);
    const known = blank();
    known.travelers = [{ id: "a", name: "Alex", household: "Klein" }];
    importToTrip(known, { kind: "flight", adults: 5 }, AT);
    expect(known.travelers.map(p => p.name)).toEqual(["Alex"]);
  });
  it("Kinder aus dem Angebot (#474): Alter oder nur Anzahl, auch neben einer Namensliste", () => {
    const a = blank();
    importToTrip(a, { kind: "stay", adults: 2, childAges: [5, 8] }, AT);
    expect(a.travelers.map(p => p.age ?? p.kind)).toEqual(["adult", "adult", 5, 8]);
    const b = blank();
    importToTrip(b, { kind: "stay", adults: 2, children: 3 }, AT);
    expect(b.travelers.map(p => p.kind)).toEqual(["adult", "adult", "child", "child", "child"]);
    const c = blank();
    importToTrip(c, { kind: "stay", adults: 2, childAges: [4], travelers: [{ name: "Anna", household: "Berg" }, { name: "Ben", household: "Berg" }] }, AT);
    expect(c.travelers.map(p => [p.household, p.age ?? p.kind])).toEqual([["Berg", "adult"], ["Berg", "adult"], ["Berg", 4]]);
  });
  it("Hotel einzeln: Preis an der Unterkunft, Nächte ergeben die Abreise; Event ohne Flug und Hotel als Erlebnis", () => {
    const trip = blank();
    const [st] = importToTrip(trip, { kind: "stay", from: "2027-06-01", nights: 5, price: { total: 640, currency: "CHF" }, stay: { name: "Chalet" } }, AT);
    expect(trip.to).toBe("2027-06-06");
    expect(st.options[0].price).toMatchObject({ unit: 640, currency: "CHF", basis: "stay" });
    const ev = blank();
    const [it] = importToTrip(ev, { kind: "other", title: "Konzert", price: { total: 120 } }, AT);
    expect(it).toMatchObject({ cat: "attractions", name: "Konzert" });
  });
  it("bitte prüfen (#458): ohne Sicherheit alle Teile markiert, sicher erkannt keiner", () => {
    const a = blank();
    expect(importToTrip(a, pkg, AT).map(i => !!i.check)).toEqual([true, true, true]);
    const sure = { ...pkg, confidence: { place: 1, dates: 1, people: 1, price: 1, flights: 1, stay: 1, board: 1, baggage: 1, transfer: 1 } };
    expect(importToTrip(blank(), sure, AT).map(i => !!i.check)).toEqual([false, false, false]);
  });
});

describe("Kleinkinder aus der Übersicht (#474)", () => {
  it("eingetragene Kleinkinder werden Kleinkind-Platzhalter, bekannte Alter bleiben", () => {
    const a = blank();
    importToTrip(a, { kind: "stay", adults: 2, children: 3, infants: 1, childAges: [7, 1] }, AT);
    expect(a.travelers.map(p => p.age ?? p.kind)).toEqual(["adult", "adult", 7, "child", 1]);
    expect(a.travelers.map(p => p.kind)).toEqual(["adult", "adult", "child", "child", "infant"]);
  });
});

describe("Kreuzfahrt importieren (#525)", () => {
  const route = [
    { place: "Barcelona", date: "2027-05-02", dep: "18:00" }, { sea: true, date: "2027-05-03" },
    { place: "Palermo", date: "2027-05-04", arr: "08:00", dep: "17:00" }, { place: "Barcelona", date: "2027-05-09", arr: "07:00" }
  ];
  it("Route, Kabinen nach Familien, Gesamtpreis auf die Kabinen verteilt", () => {
    const trip = blank();
    const items = importToTrip(trip, { kind: "cruise", adults: 3, partyKind: "group", price: { total: 2999, currency: "EUR" }, cruise: { line: "Reederei", ship: "Meeresblick", ports: route, cabin: "balcony" } }, AT);
    expect(items.map(i => i.cat)).toEqual(["stay"]);
    const [cr] = items;
    expect(trip).toMatchObject({ place: "Barcelona", from: "2027-05-02", to: "2027-05-09" });
    expect(cr).toMatchObject({ name: "Meeresblick", icon: "ship", from: "2027-05-02", to: "2027-05-09", cruise: { line: "Reederei", ship: "Meeresblick" } });
    expect(cr.cruise!.ports.map(p => p.sea ? "~" : p.place)).toEqual(["Barcelona", "~", "Palermo", "Barcelona"]);
    expect(cr.cruise!.ports[2]).toMatchObject({ arr: "08:00", dep: "17:00" });
    const o = cr.options[0];
    expect(o.label).toBe("Reederei · Meeresblick");
    expect(o.cabins!.length).toBe(3);
    expect(o.cabins!.every(c => c.type === "balcony")).toBe(true);
    expect(o.cabins!.reduce((a, c) => a + c.price, 0)).toBeCloseTo(2999, 2);
    expect(o.price.unit).toBeCloseTo(2999, 2);
  });
  it("Preis pro Person laut Angebot an den Kabinen", () => {
    const [cr] = importToTrip(blank(), { kind: "cruise", adults: 2, partyKind: "couple", cruise: { ports: route, price: 899, per: "person" } }, AT);
    expect(cr.options[0].cabins).toMatchObject([{ type: "inside", price: 899, per: "person" }]);
    expect(cr.options[0].price.unit).toBe(1798);
  });
  it("mit Flug als Paket: Preis an der Kreuzfahrt, Flug zu 0 €", () => {
    const items = importToTrip(blank(), { kind: "cruise", adults: 2, price: { total: 2400 }, flights: { legs: [{ dir: "out", from: "DUS", to: "BCN", dep: "2027-05-02T07:00" }, { dir: "back", from: "BCN", to: "DUS", dep: "2027-05-09T12:00" }] }, cruise: { ports: route } }, AT);
    const [fl, cr] = items;
    expect(fl.options[0]).toMatchObject({ price: { unit: 0 }, pkg: {} });
    expect(cr.options[0].pkg).toMatchObject({ main: true, id: fl.options[0].pkg!.id });
    expect(cr.options[0].price.unit).toBe(2400);
  });
});
