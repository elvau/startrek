import { describe, expect, it } from "vitest";
import { totals } from "./index";
import { costParts } from "./parts";
import type { Item, Trip } from "../model";

const unit = (v: number) => ({ mode: "unit" as const, currency: "EUR", unit: v });
const trip = (items: Item[], more: Partial<Trip> = {}): Trip => ({
  id: "t", name: "Palma", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-14",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 38 }],
  items, tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, detail: { flights: true, stay: true, misc: true, attractions: true }, ...more
});
const parts = (t: Trip) => costParts(t, totals(t));

describe("Zusammensetzung des Gesamtbetrags (#418)", () => {
  it("gebucht und bezahlt zählt als gebucht, gewählt und Idee als geplant; Summe = Gesamtbetrag", () => {
    const t = trip([
      { id: "f", cat: "flights", name: "Flug", status: "booked", access: false, options: [{ id: "o", label: "", price: unit(900) }] },
      { id: "s", cat: "stay", name: "Casa Palma", status: "chosen", options: [{ id: "o", label: "", price: unit(1400) }] },
      { id: "x", cat: "attractions", name: "Bootstour", status: "idea", options: [{ id: "o", label: "", price: unit(120) }] },
      { id: "p", cat: "attractions", name: "Museum", status: "paid", options: [{ id: "o", label: "", price: unit(30) }] }
    ] as Item[]);
    const p = parts(t);
    // Kurtaxe Mallorca schätzt die App selbst: 2 € × 2 Personen × 7 Nächte, versteckt
    expect(p.sum).toEqual({ booked: 930, planned: 1520, hidden: 28 });
    expect(p.rows.booked.map(r => r.name)).toEqual(["Flug", "Museum"]);
    expect(p.rows.hidden.map(r => [r.name, r.how, r.est])).toEqual([["Kurtaxe", "Casa Palma · vor Ort", true]]);
    expect(p.sum.booked + p.sum.planned + p.sum.hidden).toBe(totals(t).total);
  });

  it("Nebenkosten vor Ort sind versteckt, bei der Buchung bezahlte zählen nach dem Status; Kaution nur als Hinweis", () => {
    const stay = (status: Item["status"]): Item => ({ id: "s" + status, cat: "stay", name: "Hotel", status, options: [{ id: "o", label: "", price: unit(1000),
      extras: [{ id: "k", kind: "citytax", amount: 20, basis: "booking", pay: "onsite", est: true }, { id: "c", kind: "cleaning", amount: 50, basis: "booking", pay: "extra" }],
      deposit: { amount: 300 } }] });
    const p = parts(trip([stay("chosen"), stay("booked")], { place: "Musterdorf" }));
    expect(p.sum).toEqual({ booked: 1050, planned: 1000, hidden: 90 });
    expect(p.rows.hidden.map(r => [r.name, r.est])).toEqual([["Kurtaxe", true], ["Endreinigung", false], ["Kurtaxe", true]]);
    expect(p.deposit).toBe(600);
  });

  it("automatische Verpflegung ist versteckt (auch im einfachen Modus), gebucht wird sie gebucht", () => {
    const food: Item = { id: "v", cat: "misc", auto: "food", hh: "Klein", name: "Verpflegung", status: "idea",
      options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 40, child: 20, qty: 7 } }] };
    const t = trip([food], { detail: {}, simple: { misc: 100 }, place: "Musterdorf" });
    const p = parts(t);
    expect(p.sum).toEqual({ booked: 0, planned: 100, hidden: 560 });
    expect(p.rows.hidden[0].calc).toContain("× 7 Tage");
    expect(totals(t).total).toBe(660);
    food.status = "booked";
    expect(parts(t).sum.booked).toBe(560);
  });
});
