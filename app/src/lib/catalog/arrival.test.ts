import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { ARRIVAL_PP, arrivalFor, bandOf, originOf, sortByDistance, totalPP, viewerCountry } from "./arrival";
import { tripToCatalog } from "./fromTrip";
import { seedCatalog } from "./seed";
import { corePP, type CatalogEntry } from "./types";

const KOELN = { lat: 50.94, lon: 6.96 };
const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  v: 1, id: "x", source: "user", lang: "de", title: "Test", kind: "stay", group: { adults: 2, children: 0, infants: 0 }, months: [5], nights: 7,
  stops: [{ place: "Ziel", lat: 50.94, lon: 6.96, nights: 7 }], costs: [{ cat: "stay", pp: 300 }], tours: [], days: [], stand: "2026-11", ...over
});
const at = (lat: number, lon: number, place = "Ziel", nights = 7) => ({ place, lat, lon, nights });

describe("Anreise als Richtwert nach Entfernung (#645)", () => {
  it("Bänder und Verkehrsmittel nach Luftlinie", () => {
    expect(bandOf(650)).toBe("near");
    expect(bandOf(1300)).toBe("short");
    expect(bandOf(3000)).toBe("mid");
    expect(bandOf(7500)).toBe("far");
    const amsterdam = arrivalFor(entry({ stops: [at(52.37, 4.9)] }), KOELN)!;
    expect(amsterdam).toMatchObject({ mode: "ground", band: "near", pp: ARRIVAL_PP[0].pp });
    const mallorca = arrivalFor(entry({ stops: [at(39.62, 2.98)] }), KOELN)!;
    expect(mallorca).toMatchObject({ mode: "flight", band: "short", pp: 220, peak: false });
    expect(mallorca.range[0]).toBeLessThan(220);
    expect(mallorca.range[1]).toBeGreaterThan(220);
  });
  it("Hauptsaison teurer", () => {
    const e = entry({ stops: [at(39.62, 2.98)], months: [7] });
    expect(arrivalFor(e, KOELN)!).toMatchObject({ peak: true, pp: 285 });
    expect(arrivalFor(e, KOELN, 5)!.peak).toBe(false);
  });
  it("ohne Flug bzw. Roadtrip immer am Boden, auch weit weg", () => {
    const e = entry({ stops: [at(39.47, -0.38)], noFly: true });
    const a = arrivalFor(e, KOELN)!;
    expect(a.mode).toBe("ground");
    expect(a.pp).toBeGreaterThan(ARRIVAL_PP[1].pp);
    expect(arrivalFor({ ...e, noFly: undefined, kind: "road" }, KOELN)!.mode).toBe("ground");
  });
  it("Rundreise: hin zum ersten, zurück vom letzten Ort", () => {
    // Amsterdam (nah) hin, Lissabon (weit) zurück
    const a = arrivalFor(entry({ kind: "round", stops: [at(52.37, 4.9, "Amsterdam"), at(38.71, -9.13, "Lissabon")] }), KOELN)!;
    expect(a.mode).toBe("flight");
    expect(a.pp).toBe(130);
  });
  it("Kreuzfahrt ab Miami: Flug plus Nacht vor dem Ablegen", () => {
    const a = arrivalFor(entry({ kind: "cruise", stops: [at(25.77, -80.19, "Miami")] }), KOELN)!;
    expect(a).toMatchObject({ mode: "flight", band: "far", preNight: 70, pp: 750 + 70 });
    const hamburg = arrivalFor(entry({ kind: "cruise", stops: [at(53.55, 9.99, "Hamburg")] }), KOELN)!;
    expect(hamburg.mode).toBe("ground");
    expect(hamburg.preNight).toBeUndefined();
  });
  it("Katalogpreis = Ziel + Anreise, ohne Wohnort nur das Ziel", () => {
    const e = entry({ stops: [at(39.62, 2.98)], tours: [{ name: "Boot", pp: 50 }] });
    expect(totalPP(e, KOELN).pp).toBe(corePP(e) + 220);
    expect(totalPP(e, null)).toEqual({ pp: corePP(e), arrival: null });
    expect(arrivalFor(entry({ stops: [{ place: "Ohne Lage", nights: 3 }] }), KOELN)).toBeNull();
  });
  it("Startort: Wohnort, sonst Hauptstadt des Landes", () => {
    expect(originOf(KOELN)).toEqual(KOELN);
    expect(originOf(null, "AT", cc => (cc === "AT" ? { lat: 48.21, lon: 16.37 } : null))).toEqual({ lat: 48.21, lon: 16.37 });
    expect(originOf(undefined, "XX", () => null)).toBeNull();
  });
  it("Vorsortierung nach Luftlinie, Reiseideen ab Köln: Amsterdam vor Mallorca", () => {
    const rows = sortByDistance(seedCatalog(), KOELN);
    const km = rows.map(r => r.km!);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    const idx = (slug: string) => rows.findIndex(r => r.e.slug === slug);
    expect(idx("gruppenreise-amsterdam-kosten")).toBeLessThan(idx("gruppenreise-mallorca-kosten"));
    expect(rows.find(r => r.e.slug === "gruppenreise-lissabon-kosten")!.band).toBe("short");
    expect(sortByDistance(seedCatalog(), null).every(r => r.km == null)).toBe(true);
  });
  it("Kreuzfahrt-Reise: Häfen als Stationen mit Lage, nicht ‚ohne Flug‘", () => {
    const trip: Trip = {
      id: "c", name: "Karibik", place: "Miami", country: "USA", from: "2027-03-01", to: "2027-03-05", tiers: {}, settings: DEFAULT_SETTINGS,
      travelers: [{ id: "a", name: "Anna", household: "A" }],
      items: [{ id: "k", cat: "stay", name: "Kreuzfahrt", status: "idea", from: "2027-03-01", to: "2027-03-05",
        cruise: { ports: [{ date: "2027-03-01", place: "Miami", lat: 25.77, lon: -80.19, cc: "US", dep: "16:00" }, { date: "2027-03-03", place: "Nassau", lat: 25.05, lon: -77.35, cc: "BS" }, { date: "2027-03-05", place: "Miami", lat: 25.77, lon: -80.19, cc: "US", arr: "07:00" }] },
        options: [{ id: "ko", label: "", price: { mode: "person", currency: "EUR", adult: 900 } }] }]
    };
    const e = tripToCatalog(trip, { lang: "de", today: "2026-11-02" });
    expect(e.kind).toBe("cruise");
    expect(e.noFly).toBeUndefined();
    expect(e.stops[0]).toMatchObject({ place: "Miami", lat: 25.77, cc: "US" });
    expect(arrivalFor(e, KOELN)!.mode).toBe("flight");
  });
});

describe("Startort ohne festen Rückfall auf Deutschland", () => {
  it("Wohnort, Vorlieben, Zeitzone, Browsersprache, sonst keiner", () => {
    expect(viewerCountry({ home: { cc: "AT" }, tz: "Europe/Berlin" })).toBe("AT");
    expect(viewerCountry({ prefsCc: "fr", lang: "de-DE" })).toBe("FR");
    expect(viewerCountry({ tz: "Europe/Zurich", lang: "de" })).toBe("CH");
    expect(viewerCountry({ tz: "Europe/Zurich", lang: "de-DE" })).toBe("CH");
    expect(viewerCountry({ lang: "fr-BE" })).toBe("BE");
    expect(viewerCountry({ lang: "de" })).toBeNull();
    expect(viewerCountry({})).toBeNull();
  });
  it("ab Zürich steht der Gardasee vor Dänemark, ab Lyon Barcelona vor Prag", () => {
    const at = (home: { lat: number; lon: number }) => sortByDistance(seedCatalog(), home).map(r => r.e.slug);
    const zh = at({ lat: 47.37, lon: 8.54 });
    expect(zh.indexOf("gardasee-mehrere-familien-kosten")).toBeLessThan(zh.indexOf("ferienhaus-daenemark-familien-kosten"));
    const lyon = at({ lat: 45.76, lon: 4.84 });
    expect(lyon.indexOf("gruppenreise-barcelona-kosten")).toBeLessThan(lyon.indexOf("gruppenreise-prag-kosten"));
    expect(arrivalFor(seedCatalog().find(e => e.slug === "gruppenreise-barcelona-kosten")!, { lat: 45.76, lon: 4.84 })!.mode).toBe("ground");
  });
  it("Startbestand ohne Bezug auf Deutschland als Startland", () => {
    const json = JSON.stringify(seedCatalog());
    expect(json).not.toMatch(/Deutschland|ab Deutschland|Anreise/);
  });
});
