import { describe, expect, it } from "vitest";
import { range } from "./format";
import { i18n } from "./i18n/index.svelte";

describe("Zeitraum-Anzeige", () => {
  it("gleicher Monat: Tage zusammen; verschiedene Jahre: beide Daten mit Jahr", () => {
    i18n.lang = "de";
    expect(range("2027-07-18", "2027-07-29")).toBe("18. bis 29. Juli");
    expect(range("2027-07-18", "2028-07-29")).toBe("18. Juli 2027 bis 29. Juli 2028");
    expect(range("2027-12-28", "2028-01-03")).toBe("28. Dezember 2027 bis 3. Januar 2028");
    i18n.lang = "en";
    expect(range("2027-07-18", "2028-07-29")).toMatch(/2027.*2028/);
    i18n.lang = "de";
  });
});
