import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { PAGES } from "../seo/pages";
import { isArrival, scrub, tripToCatalog } from "./fromTrip";
import { SEED_META, pageToCatalog, seedCatalog, standOf } from "./seed";
import { corePP, shapeErrors, toursPP } from "./types";

const L = (dir: "out" | "back" | "via", from: string, to: string, dep: string) => ({ dir, from, to, dep, arr: dep, carrier: "Sun Air" });
const PLACES: Record<string, { lat: number; lon: number; cc: string }> = { Split: { lat: 43.51, lon: 16.44, cc: "HR" }, Dubrovnik: { lat: 42.65, lon: 18.09, cc: "HR" } };
const resolve = (n: string) => PLACES[n] || null;

function trip(): Trip {
  return {
    id: "t", name: "Kroatien mit Familie Klein", place: "Split", country: "Kroatien", from: "2027-06-05", to: "2027-06-10", tiers: {}, settings: DEFAULT_SETTINGS,
    travelers: [
      { id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 42 },
      { id: "c", name: "Carla", household: "Klein", age: 8 }, { id: "d", name: "Dora", household: "Klein", age: 1 }
    ],
    households: { Klein: { plz: "50667", geo: { lat: 50.94, lon: 6.95, ort: "Köln" } } },
    items: [
      { id: "f", cat: "flights", name: "Flug", status: "booked", booking: { ref: "XK42QZ", provider: "Billigflug24" },
        options: [{ id: "fo", label: "Sun Air", price: { mode: "unit", currency: "EUR", unit: 800 }, source: { name: "Billigflug24", url: "https://example.com/f" },
          legs: [L("out", "CGN", "SPU", "2027-06-05T14:30"), L("back", "DBV", "CGN", "2027-06-10T18:00")] }] },
      { id: "v", cat: "flights", name: "Inselflug", status: "idea",
        options: [{ id: "vo", label: "", price: { mode: "unit", currency: "EUR", unit: 200 }, legs: [L("via", "SPU", "DBV", "2027-06-08T09:00")] }] },
      { id: "s1", cat: "stay", name: "Villa Sonnenschein bei Anna", status: "paid", from: "2027-06-05", to: "2027-06-08", payments: [{ amount: 300, by: "Klein" }],
        options: [{ id: "s1o", label: "Villa Sonnenschein", price: { mode: "unit", currency: "EUR", unit: 100 }, stay: { board: "breakfast" }, loc: { lat: 43.5, lon: 16.4 },
          query: { place: "Split", checkin: "2027-06-05", checkout: "2027-06-08", adults: 3, childAges: [8], rooms: 1 } }] },
      { id: "s2", cat: "stay", name: "Unterkunft in Dubrovnik", status: "idea", from: "2027-06-08", to: "2027-06-10",
        options: [{ id: "s2o", label: "Hotel", price: { mode: "unit", currency: "EUR", unit: 200 }, query: { place: "Dubrovnik", checkin: "2027-06-08", checkout: "2027-06-10", adults: 3, childAges: [8], rooms: 1 } }] },
      { id: "t1", cat: "attractions", name: "Bootstour mit Ben", status: "idea", day: "2027-06-06T10:00", options: [{ id: "x", label: "", price: { mode: "person", currency: "EUR", adult: 40 } }] },
      { id: "t2", cat: "attractions", name: "Freizeitpark", status: "dropped", options: [{ id: "y", label: "", price: { mode: "person", currency: "EUR", adult: 50 } }] },
      { id: "r", cat: "transport", name: "Mietwagen", status: "idea", hint: "rental", note: "Anna fährt", options: [{ id: "ro", label: "", price: { mode: "unit", currency: "EUR", unit: 160 } }] },
      { id: "z", cat: "transport", name: "Zug zum Flughafen", status: "idea", arrival: true, options: [{ id: "zo", label: "", price: { mode: "person", currency: "EUR", adult: 30 } }] }
    ],
    expenses: [{ id: "e", text: "Eis", amount: 12, by: "Klein" }],
    days: {
      "2027-06-07": { title: "Ruhetag bei Carla", notes: [{ id: "n1", text: "Strand, Anna ruft an: 0176 1234567", kind: "rest" }] },
      "2027-06-08": { notes: [{ id: "n2", text: "Bus nach Dubrovnik, Infos unter https://example.com/bus", kind: "move", time: "09:00" }] }
    }
  };
}

describe("Reise → Katalogeintrag (#642)", () => {
  const e = tripToCatalog(trip(), { lang: "de", today: "2026-11-02", resolve, by: "reh42" });

  it("keine persönlichen Daten, Anbieter, Buchungsnummern oder Links", () => {
    const json = JSON.stringify(e);
    for (const bad of ["Anna", "Ben", "Carla", "Dora", "Klein", "XK42QZ", "Billigflug24", "Sun Air", "example.com", "0176", "50667", "Köln", "Anna fährt", "Eis", "payments", "booking"])
      expect(json, bad).not.toContain(bad);
    expect(e.by).toBe("reh42");
    expect(e.title).toBe("Kroatien mit Familie");
  });
  it("Reisende nur als Anzahl je Altersklasse", () => {
    expect(e.group).toEqual({ adults: 2, children: 1, infants: 1 });
  });
  it("Anreise fällt weg, Flug zwischen Stationen bleibt", () => {
    expect(isArrival(trip().items[0], trip())).toBe(true);
    expect(isArrival(trip().items[1], trip())).toBe(false);
    expect(e.costs.filter(c => c.cat === "flights")).toEqual([{ cat: "flights", pp: 50 }]);
    expect(e.costs.some(c => c.cat === "transport" && c.pp === 8)).toBe(false);
  });
  it("Stationen mit Nächten und Lage, Rundreise, Monate, Stand", () => {
    expect(e.stops).toEqual([
      { place: "Split", nights: 3, lat: 43.5, lon: 16.4, cc: "HR" },
      { place: "Dubrovnik", nights: 2, lat: 42.65, lon: 18.09, cc: "HR", by: "plane" }
    ]);
    expect(e.kind).toBe("round");
    expect(e.nights).toBe(5);
    expect(e.months).toEqual([6]);
    expect(e.stand).toBe("2026-11");
    expect(e.move).toEqual(["car"]);
    expect(e.noFly).toBeUndefined();
  });
  it("Unterkunft pro Person mit Ort, Nächten und Verpflegung", () => {
    expect(e.costs.find(c => c.cat === "stay" && c.place === "Split")).toEqual({ cat: "stay", pp: 75, place: "Split", nights: 3, board: "breakfast" });
  });
  it("Touren getrennt, mit Tag und Uhrzeit, verworfene fehlen; zählen nicht zum Richtpreis", () => {
    expect(e.tours).toHaveLength(1);
    expect(e.tours[0]).toMatchObject({ name: "Bootstour mit", day: 2, time: "10:00" });
    expect(toursPP(e)).toBe(e.tours[0].pp);
    expect(corePP(e)).toBe(50 + 75 + 100 + 40);
  });
  it("Tagesplan relativ und bereinigt", () => {
    expect(e.days).toEqual([
      { n: 3, title: "Ruhetag bei", notes: [{ text: "Strand, ruft an", kind: "rest" }] },
      { n: 4, notes: [{ text: "Bus nach Dubrovnik, Infos unter", kind: "move", time: "09:00" }] }
    ]);
  });
  it("Form gültig", () => {
    expect(shapeErrors(e)).toEqual([]);
  });
  it("ohne Flug mit mehreren Stationen: Roadtrip", () => {
    const t = trip();
    t.items = t.items.filter(i => i.cat !== "flights");
    const r = tripToCatalog(t, { lang: "de", today: "2026-11-02", resolve });
    expect(r.kind).toBe("road");
    expect(r.noFly).toBe(true);
  });
});

describe("scrub", () => {
  it("Namen nur als ganzes Wort, Daten bleiben", () => {
    expect(scrub("Kleiner Strand mit Klein am 2027-06-05", ["Klein"])).toBe("Kleiner Strand mit am 2027-06-05");
    expect(scrub("Mail an a.b@x.de oder +49 30 1234567", [])).toBe("Mail an oder");
    expect(scrub("Treffpunkt 0900", [])).toBe("Treffpunkt 0900");
  });
});

describe("Startbestand aus den Reiseideen (#642)", () => {
  const all = seedCatalog();
  it("jede Reiseidee ein gültiger Eintrag mit Lage", () => {
    expect(all).toHaveLength(PAGES.length);
    expect(Object.keys(SEED_META).sort()).toEqual(PAGES.map(p => p.slug).sort());
    for (const e of all) {
      expect(shapeErrors(e), e.id).toEqual([]);
      expect(e.stops[0].lat, e.id).toBeTypeOf("number");
      expect(e.stops[0].cc, e.id).toMatch(/^[A-Z]{2}$/);
      expect(e.source).toBe("idea");
      expect(corePP(e), e.id).toBeGreaterThan(0);
    }
  });
  it("ohne Anreise: kein Flug, keine Hin- und Rückfahrt", () => {
    for (const e of all) {
      expect(e.costs.some(c => c.cat === "flights"), e.id).toBe(false);
      expect(e.costs.some(c => /hin und zurück|^Anreise|Reisebus/i.test(c.label || "")), e.id).toBe(false);
    }
  });
  it("Ausflüge sind Touren, Skipass und Festivalticket bleiben im Kern", () => {
    const ski = all.find(e => e.slug === "skiurlaub-gruppe-oesterreich-kosten")!;
    expect(ski.costs.some(c => c.label === "Skipass 6 Tage")).toBe(true);
    const fest = all.find(e => e.slug === "festival-mit-freunden-kosten")!;
    expect(fest.costs.some(c => c.cat === "attractions")).toBe(true);
    const mallorca = all.find(e => e.slug === "gruppenreise-mallorca-kosten")!;
    expect(mallorca.tours.map(x => x.name)).toEqual(["Ausflüge, Beach Club, Bootstour"]);
    expect(mallorca.costs.some(c => c.cat === "attractions")).toBe(false);
  });
  it("Familien aus dem Link: Erwachsene und Kinder", () => {
    expect(pageToCatalog(PAGES.find(p => p.slug === "gardasee-mehrere-familien-kosten")!)!.group).toEqual({ adults: 6, children: 5, infants: 0 });
  });
  it("Stand", () => {
    expect(standOf("Oktober 2026")).toBe("2026-10");
    expect(standOf("bald")).toBe("");
  });
});
