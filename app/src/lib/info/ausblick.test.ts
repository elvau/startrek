import { describe, expect, it } from "vitest";
import { parseAusblick, pick } from "./ausblick";
import seed from "./ausblick.seed.json";

describe("Neues & Ausblick", () => {
  it("lässt nur bekannte Felder durch und kürzt", () => {
    const d = parseAusblick({
      stand: "2026-10-14T05:00:00Z",
      boese: "<script>",
      neu: [{ version: "0.40.0", datum: "2026-10-14", punkte: [{ de: "Reiseübersicht", xx: "weg" }, { fr: "ohne de/en" }] }, { version: "v1", datum: "2026-10-01", punkte: [{ de: "x" }] }],
      bald: [{ nr: 377, status: "in-arbeit", titel: { de: "Feiertage\n im  Kalender", en: "Holidays" }, text: { de: "a".repeat(2000) } }, { titel: {} }, { status: "quatsch", titel: { de: "ok" } }],
      fehler: "kein Array",
      faq: [{ f: { de: "Kostet das etwas?" }, a: { de: "Nein." } }, { f: { de: "ohne Antwort" } }]
    })!;
    expect(d).not.toHaveProperty("boese");
    expect(d.neu).toEqual([{ version: "0.40.0", datum: "2026-10-14", punkte: [{ de: "Reiseübersicht" }] }]);
    expect(d.bald[0].titel.de).toBe("Feiertage im Kalender");
    expect(d.bald[0].text!.de!.length).toBe(600);
    expect(d.bald[1]).toEqual({ status: "geplant", titel: { de: "ok" } });
    expect(d.fehler).toEqual([]);
    expect(d.faq).toHaveLength(1);
  });
  it("ohne Stand oder kaputt: null", () => {
    expect(parseAusblick({ neu: [] })).toBeNull();
    expect(parseAusblick("x")).toBeNull();
    expect(parseAusblick(null)).toBeNull();
  });
  it("Sprache: gewählt, sonst Englisch, sonst Deutsch", () => {
    expect(pick({ de: "Hallo", en: "Hello", fr: "Salut" }, "fr")).toBe("Salut");
    expect(pick({ de: "Hallo", en: "Hello" }, "pl")).toBe("Hello");
    expect(pick({ de: "Hallo" }, "ar")).toBe("Hallo");
  });
  it("mitgelieferte Startdatei ist gültig und in allen Sprachen", () => {
    const d = parseAusblick(seed)!;
    expect(d.faq.length).toBeGreaterThan(4);
    for (const q of d.faq) for (const k of ["de", "en", "es", "fr", "pl", "ru", "ar"] as const) { expect(q.f[k]).toBeTruthy(); expect(q.a[k]).toBeTruthy(); }
  });
});
