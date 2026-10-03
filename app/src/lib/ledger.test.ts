import { describe, expect, it } from "vitest";
import { expState, ledger, settle } from "./ledger";
import { totals } from "./calc";
import { DEFAULT_SETTINGS, type Trip } from "./model";

const trip = (): Trip => ({
  id: "t", name: "T", place: "", country: "", tiers: {}, settings: { ...DEFAULT_SETTINGS, rates: { EUR: 1, HRK: 7.5 } },
  travelers: [
    { id: "a", name: "Anna", household: "Klein" }, { id: "b", name: "Ben", household: "Klein" },
    { id: "c", name: "Carl", household: "Groß" }, { id: "d", name: "Dora", household: "Groß" },
    { id: "e", name: "Emil", household: "Solo" }
  ],
  items: [{ id: "h", cat: "stay", name: "Hotel", status: "booked", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 1000 } }], payments: [{ amount: 1000, by: "Klein" }] }]
});

describe("Kasse", () => {
  it("Zahlung zu einem Posten: Anteil wie in der Abrechnung, Saldo je Familie", () => {
    const t = trip();
    const L = ledger(t, totals(t));
    const row = (h: string) => L.rows.find(r => r.hh === h)!;
    expect(row("Klein").paid).toBe(1000);
    expect(row("Klein").bal).toBeCloseTo(600);
    expect(row("Groß").bal).toBeCloseTo(-400);
    expect(row("Solo").bal).toBeCloseTo(-200);
    expect(L.moves).toEqual([{ from: "Groß", to: "Klein", v: 400 }, { from: "Solo", to: "Klein", v: 200 }]);
  });
  it("Ausgabe unterwegs in Fremdwährung, nur für einige Familien", () => {
    const t = trip(); t.items = [];
    t.expenses = [{ id: "x", text: "Abendessen", amount: 300, currency: "HRK", by: "Groß", for: ["Groß", "Solo"] }];
    const L = ledger(t, totals(t));
    expect(L.spent).toBeCloseTo(40);
    expect(L.rows.find(r => r.hh === "Solo")!.bal).toBeCloseTo(-40 / 3);
    expect(L.rows.find(r => r.hh === "Klein")!.bal).toBeCloseTo(0);
  });
  it("Ausgleichszahlung gleicht den Saldo aus", () => {
    const t = trip(); t.transfers = [{ id: "z", from: "Groß", to: "Klein", amount: 400 }];
    const L = ledger(t, totals(t));
    expect(L.rows.find(r => r.hh === "Groß")!.bal).toBeCloseTo(0);
    expect(L.moves).toEqual([{ from: "Solo", to: "Klein", v: 200 }]);
  });
  it("wenige Überweisungen", () => {
    expect(settle([{ hh: "A", bal: 50 }, { hh: "B", bal: -30 }, { hh: "C", bal: -20 }, { hh: "D", bal: 0.2 }])).toEqual([{ from: "B", to: "A", v: 30 }, { from: "C", to: "A", v: 20 }]);
  });
  it("geteilte Reise: Eingereichtes zählt erst nach ✅, bei ❌ entscheidet der Admin", () => {
    const t = trip(); t.items = [];
    const e = { id: "x", text: "Taxi", amount: 50, by: "Solo", uid: "u-emil", who: "Emil" } as NonNullable<Trip["expenses"]>[number];
    t.expenses = [e];
    let L = ledger(t, totals(t), "u-owner");
    expect(L.entries[0].state).toBe("open");
    expect(L.rows.find(r => r.hh === "Solo")?.bal || 0).toBe(0);
    expect(L.pending).toEqual({ n: 1, v: 50, disputed: 0 });
    // selbst bestätigen zählt nicht
    e.ok = { "u-emil": "Emil" };
    expect(expState(e, "u-owner")).toBe("open");
    e.ok["u-anna"] = "Anna";
    L = ledger(t, totals(t), "u-owner");
    expect(L.rows.find(r => r.hh === "Solo")!.bal).toBeCloseTo(40);
    // Einspruch: wartet auf den Admin, zählt nicht
    e.no = { "u-carl": { name: "Carl", why: "war privat" } };
    expect(expState(e, "u-owner")).toBe("disputed");
    expect(ledger(t, totals(t), "u-owner").pending.disputed).toBe(1);
    e.state = "rejected";
    expect(ledger(t, totals(t), "u-owner").pending.n).toBe(0);
    e.state = "approved";
    expect(expState(e, "u-owner")).toBe("ok");
    // vom Admin selbst oder ohne Konto: sofort
    expect(expState({ ...e, state: undefined, no: undefined, ok: undefined, uid: "u-owner" }, "u-owner")).toBe("ok");
    expect(expState({ id: "y", text: "", amount: 1, by: "Klein" })).toBe("ok");
  });
});
