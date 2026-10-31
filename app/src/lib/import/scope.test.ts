import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncTips } from "../fees";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { importToTrip } from "./apply";
import type { ImportedOffer } from "./ai";
import { mergeInto, packagePriced, partsOf, pickParts, preselectMore, splitScope } from "./scope";

beforeAll(() => syncTips(false));
afterAll(() => syncTips(true));

const AT = "2026-10-31T12:00:00.000Z";
const LEGS = [{ dir: "out" as const, from: "DUS", to: "PMI", dep: "2027-05-10T06:10" }, { dir: "back" as const, from: "PMI", to: "DUS", dep: "2027-05-17T21:40" }];
// Pauschalreise: ein Preis für alles
const pkg: ImportedOffer = { kind: "package", place: "Palma", from: "2027-05-10", to: "2027-05-17", adults: 4, price: { total: 2000, currency: "EUR" }, flights: { legs: LEGS }, stay: { name: "Hotel Sol" }, transfer: { included: true } };
// Hotel mit eigenem Preis, im selben Screenshot auch ein Flug mit Preis
const hotel: ImportedOffer = { kind: "stay", place: "Palma", adults: 4, price: { total: 900, currency: "EUR" }, stay: { name: "Hotel Mar", price: 900 }, flights: { legs: LEGS, price: 480 } };

// Reise mit zwei Familien, Ziel und Daten stehen schon
const trip = (): Trip => ({
  id: "t", name: "Mallorca 2027", autoName: false, place: "Palma", country: "ES", from: "2027-05-10", to: "2027-05-17",
  travelers: [{ id: "a", name: "Anna", household: "Berg", kind: "adult" }, { id: "b", name: "Ben", household: "Berg", kind: "adult" }, { id: "c", name: "Cem", household: "Yilmaz", kind: "adult" }],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
});

describe("Import je Einstieg (#615)", () => {
  it("Teile des Angebots wie in der Reise", () => {
    expect(partsOf(pkg)).toEqual(["flights", "stay", "transfer"]);
    expect(partsOf({ kind: "other", title: "Stadtführung", price: { total: 40 } })).toEqual(["offer"]);
    expect(partsOf({ kind: "rental", price: { total: 200 } })).toEqual(["rental"]);
    expect(partsOf({ kind: "other" })).toEqual([]);
  });

  it("Kapitel trennt in passende Teile und weitere Funde", () => {
    expect(splitScope(hotel, "stay")).toEqual({ inScope: ["stay"], more: ["flights"] });
    expect(splitScope(pkg, "flights")).toEqual({ inScope: ["flights"], more: ["stay", "transfer"] });
    expect(splitScope(pkg, "transport")).toEqual({ inScope: ["transfer"], more: ["flights", "stay"] });
    expect(splitScope(pkg, "all")).toEqual({ inScope: ["flights", "stay", "transfer"], more: [] });
    expect(splitScope({ kind: "other", price: { total: 40 } }, "attractions")).toEqual({ inScope: ["offer"], more: [] });
  });

  it("Rückfrage: weitere Funde nicht angehakt, außer der Preis gilt nur fürs Paket oder im Kapitel ist nichts", () => {
    expect(packagePriced(pkg)).toBe(true);
    expect(packagePriced(hotel)).toBe(false);
    expect(preselectMore(hotel, "stay")).toEqual([]);
    expect(preselectMore(pkg, "stay")).toEqual(["flights", "transfer"]);
    // Tour-Import, gefunden nur ein Hotel: vorab angehakt
    expect(preselectMore({ ...hotel, flights: undefined }, "attractions")).toEqual(["stay"]);
  });

  it("nur die Unterkunft: kein Flug in der Reise, Ziel, Daten, Name, Reisende und Essen bleiben", () => {
    const t = trip();
    const items = importToTrip(t, pickParts(hotel, ["stay"]), AT, true);
    expect(items.map(i => i.cat)).toEqual(["stay"]);
    expect(t.items.some(i => i.cat === "flights")).toBe(false);
    expect(items[0].options[0].price.unit).toBe(900);
    expect(t.name).toBe("Mallorca 2027");
    expect(t.travelers.map(p => p.id)).toEqual(["a", "b", "c"]);
    expect(t.ai).toBeUndefined();
    expect(t.food).toBeUndefined();
  });

  it("Flug und Hotel angehakt: beide als Posten", () => {
    const t = trip();
    const items = importToTrip(t, pickParts(hotel, ["stay", "flights"]), AT, true);
    expect(items.map(i => i.cat).sort()).toEqual(["flights", "stay"]);
  });

  it("Mietwagen abgewählt: kein Mietwagen-Posten, auch wenn das Angebot einer ist", () => {
    const t = trip();
    const o: ImportedOffer = { kind: "rental", price: { total: 300 }, rental: { company: "Sixt", price: 300 }, stay: { name: "Finca", price: 700 } };
    const items = importToTrip(t, pickParts(o, ["stay"]), AT, true);
    expect(items.map(i => i.cat)).toEqual(["stay"]);
  });

  it("an einen vorhandenen Posten: Angebot kommt dazu, kein neuer Posten", () => {
    const t = trip();
    t.items.push({ id: "h", cat: "stay", name: "Hotel", status: "idea", options: [{ id: "o1", label: "Hotel Alt", price: { mode: "unit", currency: "EUR", unit: 1000 } }] });
    const made = importToTrip(t, pickParts(hotel, ["stay"]), AT, true);
    const got = mergeInto(t, made, "h");
    expect(got.map(i => i.id)).toEqual(["h"]);
    expect(t.items.filter(i => i.cat === "stay")).toHaveLength(1);
    expect(t.items[0].options.map(o => o.label)).toEqual(["Hotel Alt", "Hotel Mar"]);
    expect(t.offer?.items).toEqual(["h"]);
  });

  it("an einen Posten anderer Kategorie bzw. ohne Posten: neue Posten bleiben", () => {
    const t = trip();
    t.items.push({ id: "f", cat: "flights", name: "Flug", status: "idea", options: [] });
    const made = importToTrip(t, pickParts(hotel, ["stay"]), AT, true);
    expect(mergeInto(t, made, "f")).toEqual(made);
    expect(mergeInto(t, made, "fehlt")).toEqual(made);
    expect(mergeInto(t, made)).toEqual(made);
  });
});
