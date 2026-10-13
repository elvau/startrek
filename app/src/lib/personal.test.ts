import { describe, expect, it } from "vitest";
import { fcdoUrl, personalHints, type SafetyData } from "./personal";

const data: SafetyData = {
  lgbt: { IR: "death", QA: "crime", RU: "restrict", AE: "crime" },
  women: { IR: "dress,guardian", QA: "dress", SA: "guardian,unbekannt" },
  x: ["AE"], xManual: ["US"],
  fcdo: { IR: "iran", QA: "qatar" }
};

describe("persönliche Reisehinweise", () => {
  it("ohne Angaben oder ohne Daten: nichts", () => {
    expect(personalHints(data, undefined, ["IR"])).toEqual([]);
    expect(personalHints(null, { gender: "f", lgbtq: "1" }, ["IR"])).toEqual([]);
    expect(personalHints(data, { gender: "m" }, ["IR", "QA"])).toEqual([]);
  });

  it("Frauen: nur Länder mit Stichworten, unbekannte Stichworte fallen weg", () => {
    expect(personalHints(data, { gender: "f" }, ["FR", "IR", "SA"])).toEqual([
      { kind: "women", cc: "IR", tags: ["dress", "guardian"] },
      { kind: "women", cc: "SA", tags: ["guardian"] }
    ]);
  });

  it("„X“: Länder aus FCDO und von Hand, sonst ein allgemeiner Hinweis fürs Ausland", () => {
    expect(personalHints(data, { gender: "x" }, ["AE", "US", "FR"])).toEqual([{ kind: "x", cc: "AE" }, { kind: "x", cc: "US" }]);
    expect(personalHints(data, { gender: "x" }, ["FR"])).toEqual([{ kind: "xAny" }]);
    // nur im eigenen Land: kein Hinweis
    expect(personalHints(data, { gender: "x", nats: "DE" }, ["DE"])).toEqual([]);
  });

  it("LGBTQ+ nur mit Schalter, unabhängig vom Geschlecht, strengste zuerst", () => {
    expect(personalHints(data, { gender: "m" }, ["RU", "IR"])).toEqual([]);
    expect(personalHints(data, { lgbtq: "1" }, ["RU", "QA", "IR", "FR"])).toEqual([
      { kind: "lgbt", cc: "IR", level: "death" },
      { kind: "lgbt", cc: "QA", level: "crime" },
      { kind: "lgbt", cc: "RU", level: "restrict" }
    ]);
  });

  it("eigene Staatsangehörigkeit zählt nicht als Ausland, doppelte Länder einmal", () => {
    expect(personalHints(data, { gender: "f", lgbtq: "1", nats: "QA" }, ["QA", "IR", "IR"])).toEqual([
      { kind: "women", cc: "IR", tags: ["dress", "guardian"] },
      { kind: "lgbt", cc: "IR", level: "death" }
    ]);
  });

  it("Quelle je Land", () => {
    expect(fcdoUrl(data, "IR")).toBe("https://www.gov.uk/foreign-travel-advice/iran");
    expect(fcdoUrl(data, "FR")).toBeUndefined();
  });
});
