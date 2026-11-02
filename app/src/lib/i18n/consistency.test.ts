/*
 * Alle Sprachen vollständig und mit denselben Platzhaltern wie Deutsch: fehlt ein Platzhalter, steht in der Oberfläche
 * z. B. „{n} Personen“ ohne Zahl; ein fremder bleibt als „{x}“ stehen. Nullformen (ar) dürfen Platzhalter weglassen.
 */
import { describe, expect, it } from "vitest";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { pl } from "./pl";
import { ru } from "./ru";
import { ar } from "./ar";

const DE = de as Record<string, string>;
const LANGS: Record<string, Record<string, string>> = { en, es, fr, pl, ru, ar };
const PLURAL = /\.(zero|one|two|few|many|other)$/;
const holes = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
/** Grundschlüssel mit Mehrzahlformen in Deutsch */
const plurals = new Set(Object.keys(DE).filter(k => k.endsWith(".other")).map(k => k.replace(PLURAL, "")));

describe("Übersetzungen vollständig und stimmig", () => {
  for (const [lang, dict] of Object.entries(LANGS)) {
    it(`${lang}: jeder Text aus Deutsch ist da`, () => {
      const missing = Object.keys(DE).filter(k => !plurals.has(k.replace(PLURAL, "")) && !(k in dict));
      expect(missing).toEqual([]);
      // jede Mehrzahl hat mindestens die Form „other“ (Rückfall für fehlende Formen)
      expect([...plurals].filter(b => !(`${b}.other` in dict))).toEqual([]);
    });
    it(`${lang}: keine Schlüssel, die es in Deutsch nicht gibt`, () => {
      expect(Object.keys(dict).filter(k => !(k in DE) && !plurals.has(k.replace(PLURAL, "")))).toEqual([]);
    });
    it(`${lang}: Platzhalter wie in Deutsch`, () => {
      const bad: string[] = [];
      for (const [k, v] of Object.entries(dict)) {
        const base = k.replace(PLURAL, "");
        const ref = DE[k] ?? DE[`${base}.other`];
        if (ref === undefined) continue;
        const want = holes(ref), got = holes(v);
        // Zahl {n} darf in Einzahl- und Nullformen als Wort stehen („ein“, „keine“)
        const extra = [...got].filter(x => !want.has(x) && x !== "n");
        const lost = k.endsWith(".zero") ? [] : [...want].filter(x => !got.has(x) && x !== "n");
        if (extra.length || lost.length) bad.push(`${k}: ${extra.map(x => "+" + x).concat(lost.map(x => "-" + x)).join(" ")}`);
      }
      expect(bad).toEqual([]);
    });
  }
});
