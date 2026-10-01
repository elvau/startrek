/*
 * Plausibilität: zufällige Reisen durchrechnen und prüfen, dass alle Summen zusammenpassen
 * (Kapitel, Personen, Familien, fest + offen, Anteile je Posten, Anreise). Fester Startwert, damit Fehler wiederholbar sind.
 */
import { describe, expect, it } from "vitest";
import { totals } from "./index";
import { CAT_KEYS, DEFAULT_SETTINGS, type CatKey, type Item, type Option, type Trip } from "../model";

function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }

function randomTrip(r: () => number, k: number): Trip {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const nT = 1 + Math.floor(r() * 7);
  const travelers = Array.from({ length: nT }, (_, i) => ({
    id: "p" + i, name: "P" + i, household: pick(["Klein", "Hase", "Fuchs", ""]),
    ...(r() < 0.5 ? { age: Math.floor(r() * 70) } : {}), ...(r() < 0.15 ? { active: false } : {})
  }));
  const ids = travelers.map(t => t.id);
  const day = (d: number) => `2027-07-${String(10 + d).padStart(2, "0")}`;
  const items: Item[] = [];
  const nI = Math.floor(r() * 10);
  for (let i = 0; i < nI; i++) {
    const cat = pick(CAT_KEYS);
    const unit = r() < 0.5;
    const opt = (): Option => ({
      id: "o" + i + "_" + Math.floor(r() * 1e6), label: "",
      price: unit
        ? { mode: "unit", currency: pick(["EUR", "EUR", "USD"]), unit: Math.round(r() * 900), ...(r() < 0.3 ? { qty: 1 + Math.floor(r() * 5) } : {}), ...(r() < 0.3 ? { capacity: 1 + Math.floor(r() * 4), multiply: r() < 0.5 } : {}), ...(cat === "stay" && r() < 0.5 ? { basis: "stay" as const } : {}) }
        : { mode: "person", currency: "EUR", adult: Math.round(r() * 300), ...(r() < 0.5 ? { child: Math.round(r() * 150) } : {}), ...(r() < 0.3 ? { infant: 0 } : {}) }
    });
    const it: Item = {
      id: "i" + i, cat, name: "x", status: pick(["idea", "chosen", "booked", "paid", "dropped"] as const),
      options: [opt(), ...(r() < 0.3 ? [opt()] : [])],
      ...(r() < 0.4 ? { participants: ids.filter(() => r() < 0.6) } : {}),
      ...(r() < 0.3 ? { tier: { min: 1, pct: Math.round(r() * 20) } } : {}),
      ...(r() < 0.3 ? { payments: [{ amount: Math.round(r() * 200) }] } : {})
    };
    if (cat === "stay" && r() < 0.7) { const a = Math.floor(r() * 5); it.from = day(a); it.to = day(a + 1 + Math.floor(r() * 6)); }
    items.push(it);
  }
  const detail: Partial<Record<CatKey, boolean>> = {};
  for (const c of CAT_KEYS) if (r() < 0.3) detail[c] = false;
  return {
    id: "t" + k, name: "T", place: "Split", country: "", from: day(0), to: day(8), travelers, items, tiers: {},
    settings: { ...DEFAULT_SETTINGS, rates: { EUR: 1, USD: 1.1 } }, detail,
    simple: Object.fromEntries(CAT_KEYS.map(c => [c, r() < 0.4 ? Math.round(r() * 500) : 0])),
    lines: r() < 0.5 ? [{ id: "l1", cat: pick(CAT_KEYS), label: "", amount: Math.round(r() * 300), ...(r() < 0.5 ? { who: ids.filter(() => r() < 0.5) } : {}) }] : []
  } as Trip;
}

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01);

describe("Plausibilität der Rechnung (500 zufällige Reisen)", () => {
  const r = rng(42);
  const trips = Array.from({ length: 500 }, (_, k) => randomTrip(r, k));
  it("Kapitel, Personen, Familien und fest + offen ergeben jeweils die Gesamtsumme", () => {
    for (const tr of trips) {
      const T = totals(tr);
      const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
      close(sum(T.byCat), T.total);
      close(T.fixed + T.open, T.total);
      // nur, wenn jemand dabei ist (sonst gibt es niemanden, auf den sich Kosten verteilen)
      if (T.active) {
        close(sum(T.byPerson), T.total);
        close(sum(T.byHousehold), T.total);
      }
      expect(T.paid).toBeLessThanOrEqual(T.total + 0.01);
      for (const v of Object.values(T.byPerson)) expect(v).toBeGreaterThanOrEqual(-0.001);
    }
  });
  it("je Posten: Anteile ergeben den Betrag nach Rabatt, Rabatt = brutto − netto", () => {
    for (const tr of trips) {
      const T = totals(tr);
      for (const [id, c] of Object.entries(T.items)) {
        const per = Object.values(c.per).reduce((a, b) => a + b, 0);
        if (c.n) close(per, c.net);
        close(c.gross - c.net, c.saved);
        expect(c.net, id).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
