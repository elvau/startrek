/*
 * Use Cases der Kasse: wer hat ausgelegt, wer schuldet wem. Dazu Invarianten (Salden ergeben null,
 * Ausgleich gleicht alles aus) über Zufallsreisen.
 */
import { describe, expect, it } from "vitest";
import { kassen, kasseOf, ledger, settle } from "./ledger";
import { totals } from "./calc";
import { DEFAULT_SETTINGS, type Expense, type Item, type Traveler, type Trip } from "./model";

const P = (id: string, age: number | null, household: string, x: Partial<Traveler> = {}): Traveler => ({ id, name: id, age, household, ...x });
const trip = (travelers: Traveler[], x: Partial<Trip> = {}): Trip => ({
  id: "t", name: "T", place: "", country: "", tiers: {}, items: [], travelers,
  settings: { ...DEFAULT_SETTINGS, rates: { EUR: 1, HRK: 7.5, USD: 1.1 } }, ...x
});
const exp = (id: string, amount: number, by: string, x: Partial<Expense> = {}): Expense => ({ id, text: id, amount, by, ...x });
const bal = (L: ReturnType<typeof ledger>, k: string) => L.rows.find(r => r.hh === k)?.bal || 0;
const sumBal = (L: ReturnType<typeof ledger>) => L.rows.reduce((a, r) => a + r.bal, 0);
/** Salden nach den vorgeschlagenen Überweisungen */
const after = (L: ReturnType<typeof ledger>) => {
  const b: Record<string, number> = {};
  L.rows.forEach(r => (b[r.hh] = r.bal));
  L.moves.forEach(m => { b[m.from] += m.v; b[m.to] -= m.v; });
  return b;
};

describe("Use Case: Wochenende mit drei Familien", () => {
  const t = () => trip([P("a", 40, "Klein"), P("b", 40, "Klein"), P("c", 8, "Klein"), P("d", 35, "Hase"), P("e", 35, "Hase"), P("f", 30, "Solo")], {
    expenses: [
      exp("essen", 180, "Klein"),
      exp("taxi", 30, "Hase", { for: ["Hase", "Solo"] }),
      exp("eis", 12, "Solo", { for: ["Klein"] }),
      exp("museum", 750, "Hase", { currency: "HRK" })
    ]
  });
  it("Salden ergeben zusammen null", () => {
    expect(sumBal(ledger(t(), totals(t())))).toBeCloseTo(0);
  });
  it("ausgegeben = Summe aller Ausgaben in Euro", () => {
    expect(ledger(t(), totals(t())).spent).toBeCloseTo(180 + 30 + 12 + 100);
  });
  it("nach dem Ausgleich steht jeder bei null", () => {
    const L = ledger(t(), totals(t()));
    for (const v of Object.values(after(L))) expect(Math.abs(v)).toBeLessThan(0.51);
  });
  it("höchstens n−1 Überweisungen", () => {
    const L = ledger(t(), totals(t()));
    expect(L.moves.length).toBeLessThanOrEqual(L.rows.length - 1);
  });
  it("Klein: 180 ausgelegt, schuldet 3/6 von Essen und Museum und das Eis", () => {
    const L = ledger(t(), totals(t()));
    expect(bal(L, "Klein")).toBeCloseTo(180 - 90 - 50 - 12);
  });
  it("Ausgabe für eine Familie, die nicht mehr existiert: niemand Bestimmtes, auf alle verteilt", () => {
    const tr = t(); tr.expenses = [exp("x", 60, "Klein", { for: ["Gibtsnicht"] })];
    const L = ledger(tr, totals(tr));
    expect(sumBal(L)).toBeCloseTo(0);
    expect(bal(L, "Klein")).toBeCloseTo(30);
  });
  it("Ausgabe ohne Betrag oder ohne Zahler zählt nicht", () => {
    const tr = t(); tr.expenses = [exp("x", 0, "Klein"), exp("y", -5, "Klein"), exp("z", 50, "")];
    const L = ledger(tr, totals(tr));
    expect(L.spent).toBe(0);
    expect(L.moves).toEqual([]);
  });
  it("Ausgleichszahlung höher als die Schuld: Gläubiger wird zum Schuldner", () => {
    const tr = t(); tr.expenses = [exp("x", 60, "Klein", { for: ["Klein", "Solo"] })];
    // Solo schuldet 15 (1 von 4 Personen), überweist aber 40
    tr.transfers = [{ id: "z", from: "Solo", to: "Klein", amount: 40 }];
    const L = ledger(tr, totals(tr));
    expect(bal(L, "Solo")).toBeCloseTo(25);
    expect(L.moves).toEqual([{ from: "Klein", to: "Solo", v: 25 }]);
  });
  it("Rückwärts-Ausgleich hebt die Überweisung auf", () => {
    const tr = t(); tr.expenses = [];
    tr.transfers = [{ id: "z", from: "Solo", to: "Klein", amount: 40 }, { id: "y", from: "Klein", to: "Solo", amount: 40 }];
    const L = ledger(tr, totals(tr));
    expect(L.moves).toEqual([]);
    expect(L.settled).toBe(80);
  });
});

describe("Use Case: Zahlungen zu Posten", () => {
  const items = (): Item[] => [
    { id: "h", cat: "stay", name: "Haus", status: "booked", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 900 } }],
      payments: [{ amount: 300, by: "Klein" }, { amount: 600, by: "Hase" }] },
    { id: "k", cat: "attractions", name: "Kino", status: "paid", participants: ["c"], options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 10 } }],
      payments: [{ amount: 10, by: "Hase" }] }
  ];
  const t = () => trip([P("a", 40, "Klein"), P("b", 40, "Klein"), P("c", 8, "Klein"), P("d", 35, "Hase"), P("e", 35, "Hase"), P("f", 30, "Solo")], { items: items(), detail: { stay: true, attractions: true } });
  it("Anteil wie in der Abrechnung, Zahlungen mehrerer Familien", () => {
    const L = ledger(t(), totals(t()));
    expect(sumBal(L)).toBeCloseTo(0);
    expect(bal(L, "Klein")).toBeCloseTo(300 - 450 - 10);
    expect(bal(L, "Hase")).toBeCloseTo(610 - 300);
    expect(bal(L, "Solo")).toBeCloseTo(-150);
  });
  it("Zahlung zu einem Posten, der nichts kostet: auf alle verteilt", () => {
    const tr = t(); tr.items = [{ id: "x", cat: "misc", name: "x", status: "paid", options: [], payments: [{ amount: 60, by: "Solo" }] }];
    tr.detail = { misc: true };
    const L = ledger(tr, totals(tr));
    expect(bal(L, "Solo")).toBeCloseTo(50);
    expect(sumBal(L)).toBeCloseTo(0);
  });
  it("Zahlung zu einem verworfenen Posten bleibt in der Kasse, mit Hinweis (#506)", () => {
    // Anzahlung geleistet, Posten dann verworfen: das Geld ist ausgelegt, verteilt wie zuletzt gerechnet
    const tr = t(); tr.items[0].status = "dropped";
    const L = ledger(tr, totals(tr));
    expect(L.spent).toBeCloseTo(910);
    expect(bal(L, "Hase")).toBeCloseTo(610 - 300);
    expect(sumBal(L)).toBeCloseTo(0);
    expect(L.entries.filter(e => e.dropped).map(e => e.key)).toEqual(["h:0", "h:1"]);
    expect(L.entries.find(e => e.key === "k:0")?.dropped).toBeUndefined();
  });
  it("Zahlung zu einem Posten im einfachen Modus bleibt in der Kasse, ohne Hinweis", () => {
    const tr = t(); tr.detail = { stay: false, attractions: true };
    const L = ledger(tr, totals(tr));
    expect(L.spent).toBeCloseTo(910);
    expect(L.entries.some(e => e.dropped)).toBe(false);
  });
});

describe("Use Case: getrennte Kassen", () => {
  it("Mannschaft: Ausgaben einzelner, Schuld der anderen", () => {
    const tr = trip(["A", "B", "C"].map(n => P(n, 25, "Team")), { expenses: [exp("x", 90, "p:A"), exp("y", 30, "p:B", { for: ["p:A", "p:B"] })] });
    const L = ledger(tr, totals(tr));
    expect(bal(L, "p:A")).toBeCloseTo(90 - 30 - 15);
    expect(bal(L, "p:C")).toBeCloseTo(-30);
    expect(sumBal(L)).toBeCloseTo(0);
  });
  it("Familie ohne Erwachsene (nur Jugendliche): eine Kasse für die Familie", () => {
    const tr = trip([P("x", 10, "Kids"), P("y", 11, "Kids"), P("z", 30, "Eltern")]);
    expect(kassen(tr).map(k => k.id)).toEqual(["Kids", "Eltern"]);
    expect(kasseOf(tr, tr.travelers[0])).toEqual([["Kids", 1]]);
  });
  it("Kind mit Zahler, der nicht (mehr) dabei ist: alle Erwachsenen der Familie", () => {
    const tr = trip([P("m", 40, "K"), P("p", 40, "K"), P("q", 40, "K"), P("k", 8, "K", { payer: "weg" })]);
    expect(kasseOf(tr, tr.travelers[3]).map(([k]) => k)).toEqual(["p:m", "p:p", "p:q"]);
  });
  it("Umstellung auf gemeinsame Kasse: frühere Einträge einzelner Erwachsener gehen in die Familienkasse (#498)", () => {
    // drei Erwachsene zahlen erst getrennt; nachdem einer abreist, gilt automatisch die gemeinsame Kasse
    const tr = trip([P("m", 40, "K"), P("p", 40, "K"), P("q", 40, "K"), P("s", 30, "Solo")], { expenses: [exp("x", 80, "p:m")] });
    tr.travelers[2].active = false;
    const L = ledger(tr, totals(tr));
    // K hat 80 € ausgelegt und schuldet davon 2/3 → +26,67; Solo schuldet 26,67 an K, nicht an „p:m“
    expect(L.moves).toEqual([{ from: "Solo", to: "K", v: 26.67 }]);
  });
  it("Umstellung von getrennt auf gemeinsam (Einstellung): keine Überweisung an sich selbst (#498)", () => {
    const tr = trip([P("m", 40, "K"), P("p", 40, "K")], { households: { K: { kasse: "each" } }, expenses: [exp("x", 40, "p:m")] });
    tr.households!.K.kasse = "joint";
    const L = ledger(tr, totals(tr));
    expect(L.moves).toEqual([]);
  });
});

describe("Ausgleich (settle)", () => {
  it("leer und ausgeglichen", () => {
    expect(settle([])).toEqual([]);
    expect(settle([{ hh: "A", bal: 0 }, { hh: "B", bal: 0 }])).toEqual([]);
  });
  it("Cent-Beträge unter 50 Cent werden nicht überwiesen", () => {
    expect(settle([{ hh: "A", bal: 0.4 }, { hh: "B", bal: -0.4 }])).toEqual([]);
  });
  it("ein Gläubiger, viele Schuldner", () => {
    const m = settle([{ hh: "A", bal: 100 }, ...Array.from({ length: 10 }, (_, i) => ({ hh: "S" + i, bal: -10 }))]);
    expect(m.length).toBe(10);
    expect(m.every(x => x.to === "A" && x.v === 10)).toBe(true);
  });
  it("Beträge auf Cent gerundet", () => {
    const m = settle([{ hh: "A", bal: 10 }, { hh: "B", bal: -10 / 3 }, { hh: "C", bal: -20 / 3 }]);
    expect(m).toEqual([{ from: "C", to: "A", v: 6.67 }, { from: "B", to: "A", v: 3.33 }]);
  });
  it("größter Schuldner zuerst, Reihenfolge stabil", () => {
    const m = settle([{ hh: "A", bal: 70 }, { hh: "B", bal: 30 }, { hh: "C", bal: -60 }, { hh: "D", bal: -40 }]);
    expect(m).toEqual([{ from: "C", to: "A", v: 60 }, { from: "D", to: "A", v: 10 }, { from: "D", to: "B", v: 30 }]);
  });
  it("gibt die Eingabe nicht verändert zurück", () => {
    const rows = [{ hh: "A", bal: 10 }, { hh: "B", bal: -10 }];
    settle(rows);
    expect(rows).toEqual([{ hh: "A", bal: 10 }, { hh: "B", bal: -10 }]);
  });
});

/* ---------- Invarianten ---------- */

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
function randomTrip(seed: number): Trip {
  const r = rng(seed), pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const hhs = ["A", "B", "C", "D"];
  const travelers = Array.from({ length: 2 + Math.floor(r() * 9) }, (_, i) => P("p" + i, Math.floor(r() * 60), pick(hhs), { active: r() > 0.1 }));
  const households = Object.fromEntries(hhs.filter(() => r() < 0.3).map(h => [h, { kasse: pick(["joint", "each"] as const) }]));
  const tr = trip(travelers, { households });
  const ks = kassen(tr).map(k => k.id);
  if (!ks.length) return tr;
  tr.expenses = Array.from({ length: Math.floor(r() * 10) }, (_, i) => exp("e" + i, Math.round(r() * 20000) / 100, pick(ks), {
    ...(r() < 0.4 ? { for: ks.filter(() => r() < 0.5) } : {}), ...(r() < 0.2 ? { currency: "HRK" } : {}) }));
  tr.transfers = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({ id: "x" + i, from: pick(ks), to: pick(ks), amount: Math.round(r() * 5000) / 100 }));
  tr.items = [{ id: "h", cat: "stay", name: "h", status: "booked", options: [{ id: "o", label: "", price: { mode: "person", currency: "EUR", adult: 100, child: 50 } }],
    payments: [{ amount: 100, by: pick(ks) }] }];
  tr.detail = { stay: true };
  return tr;
}

describe("Invarianten der Kasse über 300 Zufallsreisen", () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);
  it("Salden ergeben null", () => {
    for (const s of seeds) { const tr = randomTrip(s); expect(sumBal(ledger(tr, totals(tr))), `Reise ${s}`).toBeCloseTo(0, 6); }
  });
  it("nach dem Ausgleich bleibt niemandem mehr als ein Euro offen", () => {
    for (const s of seeds) {
      const tr = randomTrip(s), L = ledger(tr, totals(tr));
      for (const [k, v] of Object.entries(after(L))) expect(Math.abs(v), `Reise ${s}, ${k}`).toBeLessThan(1);
    }
  });
  it("Überweisungen nur zwischen echten Kassen, nie an sich selbst, nie 0", () => {
    for (const s of seeds) {
      const tr = randomTrip(s), L = ledger(tr, totals(tr));
      const ks = new Set(kassen(tr).map(k => k.id));
      for (const m of L.moves) {
        expect(m.from).not.toBe(m.to);
        expect(m.v).toBeGreaterThan(0);
        expect(ks.has(m.from) && ks.has(m.to), `Reise ${s}: ${m.from} → ${m.to}`).toBe(true);
      }
    }
  });
});
