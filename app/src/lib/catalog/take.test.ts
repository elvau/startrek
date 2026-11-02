import { describe, expect, it } from "vitest";
import type { Traveler } from "../model";
import { seedCatalog } from "./seed";
import { ACCESS_PP, keepCost, takeEntry, type TakeOpts } from "./take";
import type { CatalogEntry } from "./types";

const tx: TakeOpts["tx"] = (k, v) => `${k}${v ? ":" + Object.values(v).join(",") : ""}`;
const KOELN = { lat: 50.94, lon: 6.96, name: "Köln" };
const ZUERICH = { lat: 47.37, lon: 8.54, name: "Zürich" };
const bySlug = (s: string) => seedCatalog().find(e => e.slug === s)!;
const tr = (id: string, household: string, age = 40): Traveler => ({ id, name: id, household, age });

const round: CatalogEntry = {
  v: 1, id: "r", source: "user", by: "reh42", lang: "de", title: "Istrien", kind: "round", group: { adults: 2, children: 2, infants: 0 }, months: [6], nights: 8,
  stops: [{ place: "Poreč", cc: "HR", lat: 45.23, lon: 13.6, nights: 5 }, { place: "Plitvice", cc: "HR", lat: 44.88, lon: 15.62, nights: 3, by: "car" }],
  costs: [{ cat: "stay", pp: 310, place: "Poreč", nights: 5 }, { cat: "stay", pp: 150, place: "Plitvice", nights: 3 }, { cat: "transport", pp: 95 }, { cat: "misc", pp: 260, auto: "food" }],
  tours: [{ name: "Bootstour", pp: 35, day: 2, time: "10:00" }, { name: "Aquapark", pp: 40, day: 4 }, { name: "Plitvice", pp: 30, day: 7 }],
  days: [{ n: 3, title: "Strandtag", notes: [{ text: "Strand", kind: "rest" }] }, { n: 6, notes: [{ text: "Weiter nach Plitvice", kind: "move" }] }],
  stand: "2026-11"
};

describe("Katalogeintrag als neue Reise (#647)", () => {
  it("Anreise je Familie ab deren Wohnort; ohne Wohnort ab dem Startort des Betrachters", () => {
    const travelers = [tr("a", "Klein"), tr("b", "Klein"), tr("c", "Hase"), tr("d", "Hase")];
    const r = takeEntry(round, { travelers, homes: { Klein: KOELN }, origin: ZUERICH, tours: "none", tx, from: "2027-05-15" });
    const arr = r.items.filter(i => i.cat === "flights" || i.arrival);
    expect(arr.map(i => i.name)).toEqual(["flight:Köln", "ground:Zürich"]);
    expect(arr[0].participants).toEqual(["a", "b"]);
    // Flug-Richtwert ohne den Weg zum Flughafen (rechnet die App je Familie selbst)
    expect(arr[0].options[0].price.adult).toBe(220 - ACCESS_PP);
    expect(arr[1].arrival).toBe(true);
    expect(arr.every(i => i.options[0].estimate)).toBe(true);
  });
  it("Gruppe ohne Wohnorte: ein Anreise-Posten für alle", () => {
    const travelers = ["a", "b", "c", "d", "e"].map(id => tr(id, id.toUpperCase()));
    const r = takeEntry(round, { travelers, origin: KOELN, tours: "none", tx });
    const fl = r.items.filter(i => i.cat === "flights");
    expect(fl).toHaveLength(1);
    expect(fl[0].participants).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("Hauptsaison aus dem Reisebeginn", () => {
    const r = takeEntry(round, { travelers: [tr("a", "Klein")], origin: KOELN, tours: "none", tx, from: "2027-07-10" });
    expect(r.items[0].name).toBe("flight:Köln");
    expect(r.items[0].options[0].price.adult).toBe(285 - ACCESS_PP);
  });
  it("Unterkünfte je Station mit Zeitraum, Verpflegung nicht doppelt, Reiseende", () => {
    const r = takeEntry(round, { travelers: [tr("a", "K")], tours: "none", tx, from: "2027-06-05" });
    const stays = r.items.filter(i => i.cat === "stay");
    expect(stays.map(i => [i.name, i.from, i.to])).toEqual([["stay – Poreč", "2027-06-05", "2027-06-10"], ["stay – Plitvice", "2027-06-10", "2027-06-13"]]);
    expect(r.items.some(i => i.cat === "misc")).toBe(false);
    expect(r.to).toBe("2027-06-13");
    expect(keepCost({ cat: "misc", pp: 5, label: "Essen und Getränke" })).toBe(false);
    expect(keepCost({ cat: "misc", pp: 5, label: "Touristensteuer" })).toBe(true);
  });
  it("Touren: alle mit Tagesplan, nur Touren, einzelne, keine", () => {
    const base = { travelers: [tr("a", "K")], tx, from: "2027-06-05" };
    const all = takeEntry(round, { ...base, tours: "all" });
    const at = all.items.filter(i => i.cat === "attractions");
    expect(at.map(i => [i.name, i.day, i.status])).toEqual([["Bootstour", "2027-06-06T10:00", "idea"], ["Aquapark", "2027-06-08", "idea"], ["Plitvice", "2027-06-11", "idea"]]);
    expect(Object.keys(all.days)).toEqual(["2027-06-07", "2027-06-10"]);
    expect(all.days["2027-06-07"].title).toBe("Strandtag");
    const only = takeEntry(round, { ...base, tours: "tours" });
    expect(only.items.filter(i => i.cat === "attractions")).toHaveLength(3);
    expect(only.days).toEqual({});
    const pick = takeEntry(round, { ...base, tours: "pick", picked: ["Aquapark"] });
    expect(pick.items.filter(i => i.cat === "attractions").map(i => i.name)).toEqual(["Aquapark"]);
    expect(takeEntry(round, { ...base, tours: "none" }).items.some(i => i.cat === "attractions")).toBe(false);
  });
  it("ohne Reisebeginn: keine Daten an den Posten, kein Tagesplan", () => {
    const r = takeEntry(round, { travelers: [tr("a", "K")], tours: "all", tx });
    expect(r.items.every(i => !i.from && !i.day)).toBe(true);
    expect(r.days).toEqual({});
    expect(r.to).toBeUndefined();
  });
  it("Kreuzfahrt mit Flug: Nacht vor dem Ablegen als Unterkunft", () => {
    const e: CatalogEntry = { ...round, kind: "cruise", stops: [{ place: "Miami", cc: "US", lat: 25.77, lon: -80.19, nights: 7 }], costs: [], tours: [], days: [] };
    const r = takeEntry(e, { travelers: [tr("a", "K")], origin: KOELN, tours: "none", tx, from: "2027-03-01" });
    expect(r.items.map(i => i.name)).toEqual(["flight:Köln", "preNight:Miami"]);
    expect(r.items[1]).toMatchObject({ cat: "stay", from: "2027-02-28", to: "2027-03-01" });
  });
  it("Reiseidee Mallorca: Finca, Mietwagen, Touristensteuer, keine Hin- und Rückflug-Zeile aus deutscher Sicht", () => {
    const r = takeEntry(bySlug("gruppenreise-mallorca-kosten"), { travelers: [tr("a", "K")], origin: ZUERICH, tours: "tours", tx, from: "2027-06-01" });
    expect(r.items.map(i => i.name)).toEqual(["flight:Zürich", "Finca mit Pool (5 Nächte, geteilt durch 8)", "Mietwagen und Sprit (2 Autos, geteilt)", "Touristensteuer vor Ort", "Ausflüge, Beach Club, Bootstour"]);
  });
});
