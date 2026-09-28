import { describe, expect, it } from "vitest";
import data from "../../../../public/airports.json";
import { countryName, locLabel, locOf, resolveLoc, searchLocs, type AirportData } from "./locations";
// @ts-expect-error Skript ohne Typen
import { build, parseCsv } from "../../../../scripts/airports.mjs";

// echte Daten (public/airports.json, aus OurAirports)
const d = data as unknown as AirportData;

describe("Flughafen- und Städteauswahl", () => {
  it("Städte mit mehreren Flughäfen stehen vorne, ihre Flughäfen direkt dahinter", () => {
    const hits = searchLocs(d, "Tokio");
    expect(hits[0]).toMatchObject({ kind: "city", code: "TYO", name: "Tokio", en: "Tokyo", cc: "JP" });
    expect(hits[0].airports).toEqual(expect.arrayContaining(["HND", "NRT"]));
    expect(hits.slice(1, 3).map(h => h.code).sort()).toEqual(["HND", "NRT"]);
    expect(searchLocs(d, "new york")[0]).toMatchObject({ code: "NYC", airports: ["JFK", "EWR", "LGA"] });
  });

  it("ein Kürzel findet genau den Flughafen oder die Stadt", () => {
    expect(searchLocs(d, "SPU")[0]).toMatchObject({ kind: "airport", code: "SPU", city: "Split", cc: "HR" });
    expect(searchLocs(d, "jfk")[0]).toMatchObject({ kind: "airport", code: "JFK" });
    expect(searchLocs(d, "LON")[0]).toMatchObject({ kind: "city", code: "LON" });
  });

  it("deutsche und englische Ortsnamen", () => {
    expect(searchLocs(d, "Köln")[0].code).toBe("CGN");
    expect(searchLocs(d, "Munich")[0].code).toBe("MUC");
    expect(searchLocs(d, "München")[0].code).toBe("MUC");
  });

  it("Freitext von früher wird eine Auswahl", () => {
    expect(resolveLoc(d, "Split")).toMatchObject({ kind: "airport", code: "SPU" });
    expect(resolveLoc(d, "Split, Kroatien", "HR")?.code).toBe("SPU");
    expect(resolveLoc(d, "Tokio")?.code).toBe("TYO");
    expect(resolveLoc(d, "spu")?.code).toBe("SPU");
    expect(resolveLoc(d, "Makarska")).toBeNull();
  });

  it("Code nachschlagen: Stadt vor Flughafen, außer man will ausdrücklich den Flughafen", () => {
    expect(locOf(d, "BKK")).toMatchObject({ kind: "city", airports: ["BKK", "DMK"] });
    expect(locOf(d, "BKK", "airport")).toMatchObject({ kind: "airport", airports: ["BKK"] });
    expect(locLabel(locOf(d, "TYO")!)).toBe("Tokio (alle 2 Flughäfen)");
    expect(locLabel(locOf(d, "SPU")!)).toMatch(/^SPU · Split/);
  });

  it("Ländernamen auf Deutsch", () => {
    expect(countryName("HR")).toBe("Kroatien");
    expect(countryName("JP")).toBe("Japan");
  });
});

describe("Erzeugen der Flughafendaten (scripts/airports.mjs)", () => {
  const csv = [
    '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"',
    '1,"RJTT","large_airport","Tokyo Haneda International Airport",35.5523,139.78,35,"AS","JP","JP-13","Tokyo","yes","RJTT","HND",,,,,"TYO, Haneda, 羽田空港"',
    '2,"RJAA","large_airport","Narita International Airport",35.7647,140.386,141,"AS","JP","JP-12","Narita","yes","RJAA","NRT",,,,,"TYO, Tokyo"',
    '3,"LDSP","large_airport","Split Saint Jerome Airport",43.5389,16.298,79,"EU","HR","HR-17","Split","yes","LDSP","SPU",,,,,',
    '4,"EDDK","large_airport","Cologne Bonn Airport",50.8659,7.1427,302,"EU","DE","DE-NW","Köln (Cologne)","yes","EDDK","CGN",,,,,"Köln"',
    '5,"XHEL","heliport","Some Heliport",1,1,1,"EU","DE","DE-NW","X","yes",,"XHH",,,,,',
    '6,"XNOS","small_airport","No Service",1,1,1,"EU","DE","DE-NW","X","no",,"XNS",,,,,',
    '7,"EGLL","large_airport","London Heathrow Airport",51.47,-0.46,83,"EU","GB","GB-ENG","London","yes","EGLL","LHR",,,,,"LON, ""Londres"""'
  ].join("\n");

  it("liest Anführungszeichen und Kommas in Feldern", () => {
    const rows = parseCsv(csv);
    expect(rows[1][18]).toBe("TYO, Haneda, 羽田空港");
    expect(rows[7][18]).toBe('LON, "Londres"');
  });

  it("nur Flughäfen mit Linienverkehr, Städte nur mit mindestens zwei Flughäfen", () => {
    const out = build(csv, { asOf: "2026-01-01", world: { countries: [{ k: "JP", cities: [["Tokio", 35.7, 139.7, "Tokyo"]] }] } });
    expect(out.airports.map((a: string[]) => a[0]).sort()).toEqual(["CGN", "HND", "LHR", "NRT", "SPU"]);
    const hnd = out.airports.find((a: string[]) => a[0] === "HND");
    // deutscher Ortsname, Kurzname ohne „International Airport“, keine alten Codes und keine fremde Schrift in den Suchbegriffen
    expect(hnd.slice(0, 4)).toEqual(["HND", "Tokyo Haneda", "Tokio", "JP"]);
    expect(hnd[7]).toBe("Tokyo, Haneda");
    expect(out.airports.find((a: string[]) => a[0] === "CGN")[2]).toBe("Köln");
    expect(out.cities).toEqual([["TYO", "Tokio", "Tokyo", "JP", ["HND", "NRT"]]]);
  });
});
