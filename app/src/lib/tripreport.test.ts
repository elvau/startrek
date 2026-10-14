import { describe, expect, it } from "vitest";
import { reportHtml, type ReportData } from "./tripreport";
import { actualByCat, routeSvg } from "./tripreportApp";
import { totals } from "./calc";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import type { Route } from "./route";

const L = Object.fromEntries(["route", "stays", "flights", "days", "costs", "costsAfter", "total", "perPerson", "fixed", "open", "byFamily", "famCosts", "famFunds", "famDue", "planned", "actual", "diff", "spent", "kassen", "paid", "share", "bal", "moves", "footer"].map(k => [k, k.toUpperCase()])) as ReportData["L"];
const base: ReportData = {
  mode: "plan", lang: "de", title: "Japan <2027>", badge: "Reiseplan", meta: "Tokyo",
  stops: [{ icon: "📍", name: "Tokyo", sub: "7 Nächte" }],
  stays: [{ name: "Hotel & Spa", place: "Tokyo", when: "03.–10.11.", price: "1.260 €", status: "Gebucht" }],
  flights: [{ route: "FRA → HND", when: "02.11.", detail: "Lufthansa", price: "3.880 €" }],
  days: [{ head: "Tag 1", place: "Tokyo", entries: [{ icon: "🛏", text: "Check-in" }] }],
  costs: { total: "7.558 €", perPerson: "1.890 €", fixed: "5.175 €", open: "2.383 €", cats: [{ key: "flights", label: "Flüge", color: "#2F6FDB", v: 3880, text: "3.880 €" }], families: [{ name: "Bär", persons: "3", costs: "5.573 €", due: "5.573 €" }] },
  L
};

describe("Reise als PDF: HTML", () => {
  it("Plan: alle Abschnitte, Texte maskiert", () => {
    const h = reportHtml(base);
    expect(h).toContain("Japan &lt;2027&gt;");
    expect(h).toContain("Hotel &amp; Spa");
    for (const s of ["ROUTE", "STAYS", "FLIGHTS", "DAYS", "COSTS"]) expect(h).toContain(`<h2>${s}</h2>`);
    expect(h).not.toContain("COSTSAFTER");
    expect(h).toContain("@page{size:A4");
  });
  it("Rückblick: geplant gegen tatsächlich, Kassen und Ausgleich; ohne Ausgaben ein Hinweis", () => {
    const h = reportHtml({ ...base, mode: "after", actual: { spent: "369 €", cats: [{ label: "Vor Ort", color: "#1F8A70", plan: 1085, actual: 120, planText: "1.085 €", actualText: "120 €", diffText: "−965 €", over: false }], kassen: [{ name: "Bär", paid: "249 €", share: "277 €", bal: "−28 €", plus: false }], moves: ["Bär → Hase: 28 €"] } });
    expect(h).toContain("<h2>COSTSAFTER</h2>");
    expect(h).toContain("−965 €");
    expect(h).toContain("Bär → Hase: 28 €");
    expect(reportHtml({ ...base, mode: "after", actual: { spent: "0 €", cats: [], kassen: [], moves: [], none: "Noch keine Ausgaben" } })).toContain("Noch keine Ausgaben");
  });
  it("Arabisch von rechts nach links", () => expect(reportHtml({ ...base, lang: "ar", rtl: true })).toContain('lang="ar" dir="rtl"'));
});

describe("Reise als PDF: Daten", () => {
  const trip: Trip = {
    id: "t", name: "T", place: "Tokyo", from: "2027-11-03", to: "2027-11-10", tiers: {}, settings: { ...DEFAULT_SETTINGS },
    travelers: [{ id: "a", name: "Anna", household: "Bär", age: 40 }, { id: "b", name: "Ben", household: "Bär", age: 42 }],
    items: [
      { id: "f", cat: "flights", name: "Flug", status: "booked", options: [{ id: "o", label: "LH", price: { mode: "person", currency: "EUR", adult: 900 } }] },
      { id: "s", cat: "stay", name: "Hotel", status: "chosen", options: [{ id: "h", label: "H", price: { mode: "unit", currency: "EUR", unit: 700, basis: "stay" } }] },
      { id: "r", cat: "transport", name: "Bahn", status: "chosen", payments: [{ amount: 80, by: "Bär" }], options: [{ id: "j", label: "JR", price: { mode: "unit", currency: "EUR", unit: 100 } }] }
    ],
    expenses: [{ id: "x", text: "Ramen", amount: 30, by: "Bär", date: "2027-11-04" }, { id: "y", text: "Taxi", amount: 20, by: "Bär", cat: "transport" }]
  } as Trip;
  it("tatsächlich: Zahlungen, sonst gebuchte Posten, dazu Ausgaben; nur gewählte zählen nicht", () => {
    const a = actualByCat(trip, totals(trip));
    expect(a.flights).toBe(1800);
    expect(a.stay).toBe(0);
    expect(a.transport).toBe(100);
    expect(a.misc).toBe(30);
  });
  it("Route als Bild: Stationen nummeriert mit Namen, Bild abgeschnitten", () => {
    const route: Route = { points: [{ name: "Tokyo", kind: "station", lat: 35.69, lon: 139.7 }, { name: "Kyoto", kind: "station", lat: 35.0, lon: 135.77 }], segs: [{ a: 0, b: 1, mode: "ground" }] };
    const svg = routeSvg(route, 1000, 540, null);
    expect(svg).toContain(">Tokyo<");
    expect(svg).toContain(">2<");
    expect(svg).toContain('clip-path="url(#hc)"');
  });
});
