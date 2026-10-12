import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "./i18n/index.svelte";
import { CARD_KEYS, diffCount, groupDiff, monthsText, resetKey, summary } from "./prefsView";
import type { Prefs } from "./model";

beforeAll(() => { i18n.lang = "de"; });

const MINE: Prefs = { airports: ["DUS", "CGN"], maxStops: 0, bags: true, stayType: "hotel", minStars: 4, board: "breakfast", styles: ["city", "culture"], budget: "mid", holidays: "NW", months: [6, 7, 8], nightsMin: 5, nightsMax: 10, avoid: ["EG"] };

describe("Vorlieben: Kurzfassung (#161)", () => {
  it("eigene Vorlieben in Reihenfolge der Karten", () => {
    const s = summary(MINE, undefined, k => ({ EG: "Ägypten" })[k] || k).map(x => x.text);
    expect(s).toEqual(["ab DUS, CGN", "nur Direktflüge", "mit Koffer", "Hotel", "★★★★", "Frühstück", "Städte", "Kultur", "Budget mittel", "Ferien Nordrhein-Westfalen", "Jun–Aug", "5–10 Nächte", "ohne Ägypten"]);
    expect(summary(MINE).some(x => x.group)).toBe(false);
  });
  it("Gruppe: gilt Gruppe über meine, eigene Werte markiert", () => {
    const g: Prefs = { maxStops: 1, stayType: "whole", styles: ["beach"], avoid: ["TR"] };
    const s = summary(g, MINE);
    const by = (t: string) => s.find(x => x.text === t);
    expect(by("max. 1 Umstieg")?.group).toBe(true);
    expect(by("Ganze Unterkunft")?.group).toBe(true);
    expect(by("Strand")?.group).toBe(true);
    expect(by("Städte")).toBeUndefined();
    expect(by("ab DUS, CGN")?.group).toBeUndefined();
    expect(s.find(x => x.key === "avoid")?.text).toBe("ohne EG, TR");
    expect(s.find(x => x.key === "avoid")?.group).toBe(true);
  });
  it("Monate: Spannen und einzelne", () => {
    expect(monthsText([7, 6, 8])).toBe("Jun–Aug");
    expect(monthsText([1, 2, 7])).toBe("Jan, Feb, Jul");
    expect(monthsText([12, 1, 2, 3])).toBe("Jan–Mär, Dez");
  });
  it("leer: keine Kurzfassung", () => expect(summary({})).toEqual([]));
});

describe("Vorlieben: abweichend von meine", () => {
  it("zählt je Karte und gesamt, gesperrte Länder nur zusätzliche", () => {
    const g: Prefs = { maxStops: 1, stayType: "whole", styles: ["beach"], avoid: ["EG", "TR"] };
    expect(groupDiff(g, "flights")).toEqual(["maxStops"]);
    expect(diffCount(g, MINE, "stay")).toBe(1);
    expect(diffCount(g, MINE, "avoid")).toBe(1);
    expect(diffCount(g, MINE)).toBe(4);
    expect(diffCount({ styles: [] }, MINE)).toBe(0);
  });
  it("zurücksetzen macht das Feld wieder „wie meine“", () => {
    const g: Prefs = { maxStops: 1, board: "half" };
    resetKey(g, "maxStops");
    expect(g).toEqual({ board: "half" });
    expect(diffCount(g, MINE)).toBe(1);
  });
  it("jedes Feld der Vorlieben gehört zu genau einer Karte", () => {
    const all = Object.values(CARD_KEYS).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const k of ["avoid", "airports", "plz", "maxStops", "bags", "seatsTogether", "maxHours", "access", "stayType", "minStars", "board", "styles", "budget", "note", "holidays", "months", "nightsMin", "nightsMax", "car", "pet", "homeCare", "stepFree", "diet"]) expect(all).toContain(k);
  });
});
