import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncTips } from "../fees";
import { DEFAULT_SETTINGS, type Item, type Trip } from "../model";
import { importToTrip } from "./apply";
import type { ImportedOffer } from "./ai";
import { applyDiff, diffImport, needsReview } from "./diff";

beforeAll(() => syncTips(false));
afterAll(() => syncTips(true));

const AT = "2026-10-31T12:00:00.000Z";
const leg = (from: string, to: string, dep: string) => ({ dir: "out" as const, from, to, dep, arr: dep });
// Reise mit Flug (612 €), Hotel (gebucht) und Transfer
const trip = (): Trip => ({
  id: "t", name: "Kroatien", autoName: false, place: "Split", country: "HR", from: "2027-07-12", to: "2027-07-19",
  travelers: [{ id: "a", name: "Anna", household: "Berg", kind: "adult" }, { id: "b", name: "Ben", household: "Berg", kind: "adult" }],
  items: [
    { id: "f", cat: "flights", name: "Flug DUS–SPU", status: "idea", options: [{ id: "fo", label: "Croatia Air", price: { mode: "unit", currency: "EUR", unit: 612 }, legs: [leg("DUS", "SPU", "2027-07-12T06:00")] }] },
    { id: "h", cat: "stay", name: "Hotel Antea", status: "booked", from: "2027-07-12", to: "2027-07-19", options: [{ id: "ho", label: "Hotel Antea", price: { mode: "unit", currency: "EUR", unit: 900, basis: "stay", capacity: 2 } }] },
    { id: "tr", cat: "transport", name: "Transfer", hint: "transfer", status: "idea", options: [{ id: "to", label: "Taxi", price: { mode: "unit", currency: "EUR", unit: 40 } }] }
  ] as Item[],
  tiers: {}, settings: { ...DEFAULT_SETTINGS }
});
// Buchungsbestätigung: Flug günstiger, gleiches Hotel mit Preis wie vorher, dazu ein Mietwagen
const offer: ImportedOffer = {
  kind: "other", place: "Split", country: "HR", from: "2027-07-12", to: "2027-07-19", adults: 2, price: { currency: "EUR" },
  flights: { legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-12T07:30", carrier: "Eurowings" }], price: 584 },
  stay: { name: "Hotel Antea", price: 900 },
  rental: { company: "Sixt", price: 340 }
};
const made = (t: Trip) => importToTrip(JSON.parse(JSON.stringify(t)) as Trip, offer, AT, true);

describe("Änderungsansicht beim Erweitern (#617)", () => {
  it("je Posten: ersetzt (anderer Preis), ergänzt (gleicher Preis), neu, nicht im Angebot", () => {
    const t = trip();
    const rows = diffImport(t, made(t));
    const by = Object.fromEntries(rows.map(r => [r.target?.id || r.cat, r]));
    expect(by.f.kind).toBe("replace");
    // mit Anreise zum Flughafen: gleicher Aufschlag auf beiden Seiten, Unterschied 28 €
    expect(by.f.before! - by.f.after!).toBe(28);
    expect(by.f.choice).toBe("both");
    expect(by.h.kind).toBe("fill");
    expect(by.transport.kind).toBe("new");
    expect(by.transport.items[0].name).toBe("Mietwagen");
    expect(by.tr.kind).toBe("missing");
    expect(by.tr.choice).toBe("keep");
    expect(needsReview(rows)).toBe(true);
  });

  it("Standard: nichts gelöscht, nichts überschrieben; Neues dazu, ersetzter Flug als zweites Angebot", () => {
    const t = trip();
    applyDiff(t, diffImport(t, made(t)));
    expect(t.items.map(i => i.id).slice(0, 3)).toEqual(["f", "h", "tr"]);
    expect(t.items.find(i => i.id === "f")!.options.map(o => o.label)).toEqual(["Croatia Air", "Eurowings"]);
    expect(t.items.find(i => i.id === "f")!.chosen).toBeUndefined();
    expect(t.items.find(i => i.id === "h")!.status).toBe("booked");
    expect(t.items.some(i => i.name === "Mietwagen")).toBe(true);
  });

  it("gewählt: Flug ersetzen, Transfer löschen, Mietwagen weglassen", () => {
    const t = trip();
    const rows = diffImport(t, made(t));
    for (const r of rows) {
      if (r.target?.id === "f") r.choice = "replace";
      if (r.target?.id === "tr") r.choice = "delete";
      if (r.kind === "new") r.choice = "skip";
    }
    applyDiff(t, rows);
    expect(t.items.find(i => i.id === "f")!.options.map(o => o.label)).toEqual(["Eurowings"]);
    expect(t.items.some(i => i.id === "tr")).toBe(false);
    expect(t.items.some(i => i.name === "Mietwagen")).toBe(false);
  });

  it("nur Neues: keine Ansicht nötig", () => {
    const t = trip();
    t.items = [];
    expect(needsReview(diffImport(t, made(t)))).toBe(false);
  });

  it("Paket zählt als ein Posten", () => {
    const t = trip();
    const pkg: ImportedOffer = { kind: "package", adults: 2, price: { total: 2000, currency: "EUR" }, flights: { legs: [{ dir: "out", from: "DUS", to: "PMI" }] }, stay: { name: "Hotel Sol" }, transfer: { included: true } };
    const rows = diffImport(t, importToTrip(JSON.parse(JSON.stringify(t)) as Trip, pkg, AT, true));
    const p = rows.filter(r => r.id.startsWith("pkg:"));
    expect(p).toHaveLength(1);
    expect(p[0].items).toHaveLength(3);
    expect(p[0].kind).toBe("new");
  });
});
