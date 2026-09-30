import { describe, expect, it } from "vitest";
import { parseAgentRequest, parsePrefs } from "./types";
import { prefsLines, systemPrompt } from "./agent";
import { kiwiArgs } from "../flights/kiwi";

describe("Vorlieben für die KI", () => {
  it("nur bekannte Felder in Grenzen", () => {
    expect(parsePrefs({ avoid: ["EG", "tr", "TR", "XX1"], maxStops: 5, bags: "ja", styles: ["beach", "hack"], months: [7, 13, 7], nightsMin: 5, nightsMax: 3, note: "  gern ruhig  ", evil: 1 }))
      .toEqual({ avoid: ["EG", "TR"], styles: ["beach"], months: [7], nightsMin: 5, note: "gern ruhig" });
    expect(parsePrefs({})).toBeUndefined();
    const r = parseAgentRequest({ prompt: "Sommer ans Meer", prefs: { avoid: ["TR"] } });
    expect(typeof r !== "string" && r.prefs).toEqual({ avoid: ["TR"] });
  });
  it("gesperrte Länder sind eine feste Regel, der Rest Vorgabe", () => {
    const r = parseAgentRequest({ prompt: "Sommer ans Meer", prefs: { avoid: ["TR", "EG"], styles: ["beach"], budget: "low", holidays: "NW" } });
    if (typeof r === "string") throw new Error(r);
    const lines = prefsLines(r);
    expect(lines[0]).toContain("TR, EG");
    expect(lines[0]).toContain("hard rule");
    expect(lines[1]).toContain("likes beach");
    expect(lines[1]).toContain("school holidays of German state NW");
    expect(systemPrompt(r)).toContain("hard rule");
    expect(prefsLines({ ...r, prefs: undefined })).toEqual([]);
  });
  it("Flugsuche: keine Umstiege in gesperrten Ländern, höchstens so viele Stunden", () => {
    const a = kiwiArgs({ from: "DUS", to: "BKK", depart: "2027-03-01", adults: 1, children: 0, infants: 0, avoidCountries: ["TR", "RU"], maxHours: 14 });
    expect(a).toMatchObject({ exclude_stopover_countries: "TR,RU", max_fly_duration: 14 });
  });
});
