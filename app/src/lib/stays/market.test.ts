import { describe, expect, it } from "vitest";
import { parseLang, parseMarket, searchMarket } from "./market";

describe("Markt der Suche (#464)", () => {
  it("Wohnland vor Browser-Region, sonst Deutschland", () => {
    expect(searchMarket({ cc: "PL" }, "de-DE")).toBe("PL");
    // alte Wohnorte ohne Land sind deutsch
    expect(searchMarket({}, "en-GB")).toBe("DE");
    expect(searchMarket(undefined, "en-GB")).toBe("GB");
    expect(searchMarket(undefined, "fr")).toBe("DE");
    expect(searchMarket(undefined, undefined)).toBe("DE");
  });
  it("prüft Land und Sprache", () => {
    expect(parseMarket("gb")).toBe("GB");
    expect(parseMarket("GBR")).toBeUndefined();
    expect(parseMarket(1)).toBeUndefined();
    expect(parseLang("pl")).toBe("pl");
    expect(parseLang("it")).toBeUndefined();
  });
});
