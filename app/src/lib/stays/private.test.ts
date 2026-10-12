import { describe, expect, it } from "vitest";
import { destMode, savePrivate } from "./private";
import { calcItem, totals } from "../calc";
import { defaultQuery } from "../flights/app";
import { eventWindow } from "../activities/window";
import { stayPlace } from "../itinerary";
import { watchOption } from "../watch";
import { cityTaxFor } from "../fees";
import { autoName } from "../i18n/index.svelte";
import type { Trip } from "../model";

/** neue Reise ohne Ziel und Daten, zwei Reisende */
const trip = (p: Partial<Trip> = {}): Trip => ({
  id: "t", name: "", place: "", country: "",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }],
  items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, ...p
});
const lis = { place: "Lissabon", country: "Portugal", from: "2027-06-12", to: "2027-06-19" };

describe("Unterkunft privat bzw. schon vorhanden (#233)", () => {
  it("Posten ohne Kosten: Gewählt, 0 €, Ort und Zeitraum", () => {
    const tr = trip();
    const it = savePrivate(tr, lis);
    expect(it).toMatchObject({ cat: "stay", status: "chosen", name: "Privat in Lissabon", private: { place: "Lissabon", country: "Portugal" }, from: "2027-06-12", to: "2027-06-19" });
    expect(it.participants).toBeUndefined();
    expect(calcItem(it, tr).net).toBe(0);
    expect(totals(tr).total).toBe(0);
  });

  it("setzt Reiseziel und Zeitraum: Flug-, Bahn- und Event-Suche nutzen den Ort", () => {
    const tr = trip();
    savePrivate(tr, lis);
    expect([tr.place, tr.country, tr.from, tr.to]).toEqual(["Lissabon", "Portugal", "2027-06-12", "2027-06-19"]);
    const q = defaultQuery(tr);
    expect([q.to, q.depart, q.ret]).toEqual(["Lissabon", "2027-06-12", "2027-06-19"]);
    expect(eventWindow(tr)).toMatchObject({ city: "Lissabon", from: "2027-06-12", to: "2027-06-19" });
  });

  it("anderes Reiseziel bleibt, außer man will es ersetzen; vorhandener Zeitraum bleibt", () => {
    const tr = trip({ place: "Rom", country: "Italien", from: "2027-06-10", to: "2027-06-20" });
    expect(destMode(tr, "Lissabon")).toBe("ask");
    expect(destMode(tr, "rom, Italien")).toBe("same");
    expect(destMode(trip(), "Lissabon")).toBe("set");
    savePrivate(tr, lis);
    expect([tr.place, tr.from, tr.to]).toEqual(["Rom", "2027-06-10", "2027-06-20"]);
    savePrivate(tr, { ...lis, dest: true });
    expect([tr.place, tr.country]).toEqual(["Lissabon", "Portugal"]);
  });

  it("Kosten optional: für den Aufenthalt oder pro Nacht, nur für die, die dort schlafen", () => {
    const tr = trip();
    const it = savePrivate(tr, { ...lis, cost: 70 });
    expect(calcItem(it, tr).net).toBe(70);
    savePrivate(tr, { ...lis, cost: 10, basis: "night", ids: ["a"] }, it);
    expect(tr.items).toHaveLength(1);
    expect(it.participants).toEqual(["a"]);
    expect(calcItem(it, tr).net).toBe(70);
    const T = totals(tr);
    expect([T.byPerson.a, T.byPerson.b || 0]).toEqual([70, 0]);
    // negative Beträge gibt es nicht
    savePrivate(tr, { ...lis, cost: -5 }, it);
    expect(calcItem(it, tr).net).toBe(0);
  });

  it("ohne Kurtaxe, nicht beobachtet, Ort im Tagesplan, Name in der Sprache der App", () => {
    const tr = trip({ place: "Rom" });
    const it = savePrivate(tr, { ...lis, place: "Lissabon", cost: 300 });
    expect(cityTaxFor(it, it.options[0], tr)).toBeNull();
    expect(watchOption(it, tr)).toBeNull();
    expect(stayPlace(tr, it)).toBe("Lissabon");
    expect(autoName("Private in Lissabon")).toBe("Privat in Lissabon");
  });
});
