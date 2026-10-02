import { afterEach, describe, expect, it } from "vitest";
import { currencyFor, fromShown, fx, shown, toShown } from "./currency.svelte";
import { eur, eurPP, money } from "./calc";

const R = { date: "2026-10-01", rates: { EUR: 1, PLN: 4.25, GBP: 0.8, JPY: 160 } };
afterEach(() => { fx.currency = "EUR"; fx.rates = null; });

describe("Anzeigewährung", () => {
  it("Vorschlag aus der Region des Browsers", () => {
    expect([currencyFor("pl-PL"), currencyFor("en-GB"), currencyFor("de-CH"), currencyFor("de-DE"), currencyFor("ar"), currencyFor(undefined)]).toEqual(["PLN", "GBP", "CHF", "EUR", "EUR", "EUR"]);
  });
  it("Euro-Beträge in der Währung der Person; ohne Kurs Euro", () => {
    fx.currency = "PLN";
    expect(shown(100)).toEqual({ v: 100, currency: "EUR" });
    fx.rates = R;
    expect(shown(100)).toEqual({ v: 425, currency: "PLN" });
    expect(eur(100)).toBe(money(425, "PLN"));
    expect(eur(100)).toMatch(/425/);
  });
  it("Eingabe in eigener Währung, gespeichert in Euro", () => {
    fx.currency = "GBP"; fx.rates = R;
    expect(toShown(10)).toBe(8);
    expect(fromShown(8)).toBe(10);
    fx.currency = "EUR";
    expect(fromShown(8)).toBe(8);
  });
  it("pro Person mit Cent, außer bei Yen", () => {
    fx.currency = "GBP"; fx.rates = R;
    expect(eurPP(25 / 3)).toMatch(/6[.,]67/);
    fx.currency = "JPY";
    expect(eurPP(25 / 3)).toMatch(/1[.,]?333/);
  });
});
