import { describe, expect, it } from "vitest";
import { i18n, t, tn, LANGS } from "./index.svelte";
import { de } from "./de";
import { en } from "./en";
import { eur } from "../calc";
import { dayShort, monthYear, range } from "../format";

const inLang = <T>(l: (typeof LANGS)[number]["code"], fn: () => T): T => { const old = i18n.lang; i18n.lang = l; try { return fn(); } finally { i18n.lang = old; } };

describe("Übersetzungen", () => {
  it("Deutsch ohne Browser, Platzhalter werden ersetzt", () => {
    expect(i18n.lang).toBe("de");
    expect(t("perPerson", { v: "10 €" })).toBe("10 € pro Person");
    expect(tn("n.nights", 1)).toBe("1 Nacht");
    expect(tn("n.nights", 3)).toBe("3 Nächte");
  });

  it("Englisch mit eigenen Mehrzahlformen", () => {
    inLang("en", () => {
      expect(t("fs.open")).toBe("Search flights");
      expect(tn("n.persons", 1)).toBe("1 person");
      expect(tn("n.persons", 4)).toBe("4 people");
    });
  });

  it("Englisch hat jeden deutschen Text, mit denselben Platzhaltern", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
    for (const k of Object.keys(de) as (keyof typeof de)[]) {
      expect(en[k], k).toBeTypeOf("string");
      expect(ph(en[k]!), k).toBe(ph(de[k]));
    }
  });

  it("Beträge und Daten im Format der Sprache", () => {
    expect(eur(1505)).toBe("1.505 €");
    expect(range("2027-07-18", "2027-07-29")).toBe("18. bis 29. Juli");
    expect(dayShort("2027-07-18")).toBe("So 18.07.");
    inLang("en", () => {
      expect(eur(1505)).toBe("€1,505");
      expect(monthYear("2027-07-18")).toBe("July 2027");
      expect(range("2027-07-18", "2027-07-29")).toMatch(/^18\s*–\s*29 July$/);
    });
  });
});
