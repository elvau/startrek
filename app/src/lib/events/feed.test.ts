import { describe, expect, it } from "vitest";
import { fromJolpica, fromWikidata, horizon, mergeFeed, sportOf, wikidataQuery } from "./feed";
import { searchSports, SPORTS } from "./sports";

// Ausschnitt im Format der Jolpica-/Ergast-Schnittstelle
const JOLPICA = { MRData: { RaceTable: { season: "2027", Races: [
  { season: "2027", round: "1", url: "https://en.wikipedia.org/wiki/2027_Australian_Grand_Prix", raceName: "Australian Grand Prix",
    Circuit: { circuitId: "albert_park", circuitName: "Albert Park Grand Prix Circuit", Location: { lat: "-37.8497", long: "144.968", locality: "Melbourne", country: "Australia" } },
    date: "2027-03-14", time: "04:00:00Z", FirstPractice: { date: "2027-03-12", time: "01:30:00Z" } },
  { season: "2027", round: "2", raceName: "Ohne Ort", Circuit: { Location: {} }, date: "2027-03-21" },
  { season: "2027", round: "9", url: "https://en.wikipedia.org/wiki/2027_Austrian_Grand_Prix", raceName: "Austrian Grand Prix",
    Circuit: { circuitName: "Red Bull Ring", Location: { lat: "47.2197", long: "14.7647", locality: "Spielberg", country: "Austria" } }, date: "2027-06-27" }
] } } };

// SPARQL-Ergebnis (application/sparql-results+json)
const lit = (value: string) => ({ type: "literal", value });
const uri = (value: string) => ({ type: "uri", value });
const WIKIDATA = { results: { bindings: [
  { e: uri("http://www.wikidata.org/entity/Q1001"), en: lit("2027 World Aquatics Championships"), de: lit("Schwimmweltmeisterschaften 2027"), start: lit("2027-07-16T00:00:00Z"), end: lit("2027-08-01T00:00:00Z"),
    sportEn: lit("aquatic sports"), c1: lit("Point(113.264 23.129)"), locDe: lit("Guangzhou"), cc: lit("cn"), wpDe: uri("https://de.wikipedia.org/wiki/Schwimmweltmeisterschaften_2027") },
  // zweite Zeile zum selben Event (zweite Sportart): bleibt einmal
  { e: uri("http://www.wikidata.org/entity/Q1001"), en: lit("2027 World Aquatics Championships"), start: lit("2027-07-16T00:00:00Z"), sportEn: lit("swimming"), c1: lit("Point(113.264 23.129)") },
  { e: uri("http://www.wikidata.org/entity/Q1002"), en: lit("2027 FIFA Women's World Cup"), start: lit("2027-06-24T00:00:00Z"), sportEn: lit("association football"), c0: lit("Point(-43.2 -22.9)") },
  { e: uri("http://www.wikidata.org/entity/Q1003"), en: lit("Athletics at the 2028 Summer Olympics"), start: lit("2028-07-15T00:00:00Z"), sportEn: lit("athletics"), c0: lit("Point(-118.2 34.0)") },
  { e: uri("http://www.wikidata.org/entity/Q1004"), en: lit("2027 World Rowing Championships"), start: lit("2027-08-29T00:00:00Z"), sportEn: lit("rowing") },
  { e: uri("http://www.wikidata.org/entity/Q1005"), en: lit("2027 Men's Handball World Championship"), start: lit("2027-01-14T00:00:00Z"), end: lit("2027-01-31T00:00:00Z"),
    sportEn: lit("handball"), c2: lit("Point(6.95 50.94)"), locEn: lit("Cologne"), cc: lit("DE"), wpEn: uri("https://en.wikipedia.org/wiki/2027_World_Men%27s_Handball_Championship") }
] } };

describe("Sportkalender aus offenen Quellen", () => {
  it("Formel 1 (Jolpica): Wochenende vom ersten Training bis zum Rennen, Land als Code, ohne Ort fällt weg", () => {
    const l = fromJolpica(JOLPICA);
    expect(l.map(e => e.id)).toEqual(["f1-2027-1", "f1-2027-9"]);
    expect(l[0]).toMatchObject({ name: "F1 Australian Grand Prix 2027", de: "Formel 1: Australian Grand Prix 2027", sport: "motor", start: "2027-03-12", end: "2027-03-14",
      city: "Melbourne", cc: "AU", lat: -37.8497, lon: 144.968, venue: "Albert Park Grand Prix Circuit" });
    // ohne Trainingsdatum: zwei Tage vorher
    expect(l[1]).toMatchObject({ start: "2027-06-25", end: "2027-06-27", cc: "AT" });
    expect(fromJolpica({})).toEqual([]);
  });
  it("Wikidata: ein Event je Eintrag, ohne Fußball, Teilwettbewerbe und Events ohne Koordinaten", () => {
    const l = fromWikidata(WIKIDATA);
    expect(l.map(e => e.id)).toEqual(["wd-Q1001", "wd-Q1005"]);
    expect(l[0]).toMatchObject({ name: "2027 World Aquatics Championships", de: "Schwimmweltmeisterschaften 2027", sport: "other", start: "2027-07-16", end: "2027-08-01",
      city: "Guangzhou", cc: "CN", lat: 23.129, lon: 113.264, url: "https://de.wikipedia.org/wiki/Schwimmweltmeisterschaften_2027" });
    expect(l[1]).toMatchObject({ sport: "hand", city: "Cologne", lat: 50.94, lon: 6.95 });
  });
  it("Sportart aus der Bezeichnung", () => {
    expect(["ice hockey", "road bicycle racing", "alpine skiing", "Formula One", "marathon", "athletics", "association football", "rowing"].map(sportOf))
      .toEqual(["hockey", "bike", "ski", "motor", "run", "athletics", null, "other"]);
  });
  it("zusammenführen: die kuratierte Fassung gewinnt (Handball-WM), Neues kommt dazu und ist suchbar", () => {
    const all = mergeFeed(SPORTS, [...fromWikidata(WIKIDATA), ...fromJolpica(JOLPICA)]);
    expect(all.filter(e => /handball/i.test(e.name)).map(e => e.id)).toEqual(["hb27"]);
    expect(all.length).toBe(SPORTS.length + 3);
    const hits = searchSports({ q: "Schwimm", lang: "de" }, "2026-10-03", all);
    expect(hits).toMatchObject([{ id: "sp:wd-Q1001", name: "Schwimmweltmeisterschaften 2027", sport: "other" }]);
    expect(searchSports({ q: "", sport: "motor" }, "2026-10-03", all).map(e => e.id)).toContain("sp:f1-2027-9");
  });
  it("Abfrage mit Zeitraum und Mindestzahl an Artikeln; Reichweite der kuratierten Liste ohne Olympia", () => {
    const q = wikidataQuery("2026-10-03", "2029-10-03", 8);
    expect(q).toContain('"2026-10-03T00:00:00Z"^^xsd:dateTime');
    expect(q).toContain("?links >= 8");
    expect(horizon(SPORTS) < "2028-01-01").toBe(true);
    expect(horizon(SPORTS) >= "2027-06-01").toBe(true);
  });
});
