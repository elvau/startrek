import { describe, expect, it } from "vitest";
import { i18n, t, tn, LANGS } from "./index.svelte";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { pl } from "./pl";
import { ru } from "./ru";
import { ar } from "./ar";
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

  it.each([["en", en], ["es", es], ["fr", fr], ["pl", pl], ["ru", ru], ["ar", ar]] as const)("%s hat jeden deutschen Text, mit denselben Platzhaltern", (_, d) => {
    const ph = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort().join();
    for (const k of Object.keys(de) as (keyof typeof de)[]) {
      expect(d[k], k).toBeTypeOf("string");
      // Mehrzahlformen dürfen die Zahl weglassen („شخصان" = zwei Personen)
      const strip = (x: string) => /\.(zero|one|two)$/.test(k) ? x.replace(/(^|,)n(?=,|$)/, "").replace(/^,|,$/, "") : x;
      expect(strip(ph(d[k]!)), k).toBe(strip(ph(de[k])));
    }
  });

  it("Russisch und Polnisch zählen mit drei Formen", () => {
    inLang("ru", () => {
      expect([1, 2, 5, 21, 22, 25].map(n => tn("n.nights", n))).toEqual(["1 ночь", "2 ночи", "5 ночей", "21 ночь", "22 ночи", "25 ночей"]);
    });
    inLang("pl", () => {
      expect([1, 2, 5, 12, 22].map(n => tn("n.persons", n))).toEqual(["1 osoba", "2 osoby", "5 osób", "12 osób", "22 osoby"]);
    });
    inLang("fr", () => expect(tn("n.nights", 2)).toBe("2 nuits"));
    inLang("es", () => expect(t("fs.open")).toBe("Buscar vuelos"));
    inLang("ar", () => {
      expect([0, 1, 2].map(n => tn("n.persons", n))).toEqual(["لا أحد", "شخص واحد", "شخصان"]);
      expect(tn("n.persons", 5)).toMatch(/أشخاص$/);
    });
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
