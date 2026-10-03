import { describe, expect, it } from "vitest";
import { agentPrefs, groupFor, mergePrefs, prefsFor, touchesAvoided } from "./prefs";
import { DEFAULT_SETTINGS, type Directory, type Trip } from "./model";
import type { FlightOffer } from "./flights/types";

const dir: Directory = {
  people: [{ id: "a", first: "Anna", last: "K" }, { id: "b", first: "Ben", last: "K" }, { id: "u", first: "Uwe", last: "S" }],
  groups: [
    { id: "fam", name: "Familie", memberIds: ["a", "b"], prefs: { stayType: "whole", avoid: ["EG"] } },
    { id: "keg", name: "Kegeln", memberIds: ["a", "b", "u"], prefs: { stayType: "hotel", maxStops: 0 } }
  ],
  me: "a",
  prefs: { stayType: "all", maxStops: 1, bags: true, avoid: ["TR"], styles: ["beach"] }
};
const trip = (ids: string[]): Trip => ({ id: "t", name: "", place: "", country: "", travelers: ids.map(id => ({ id, name: id, household: "K", personId: id })), items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } });

describe("Vorlieben", () => {
  it("Gruppe überschreibt einzelne Punkte, gesperrte Länder werden zusammengelegt", () => {
    expect(mergePrefs(dir.prefs, dir.groups[0].prefs)).toEqual({ stayType: "whole", maxStops: 1, bags: true, avoid: ["TR", "EG"], styles: ["beach"] });
  });
  it("Gruppe der Reise: die kleinste, in der alle stecken", () => {
    expect(groupFor(trip(["a", "b"]), dir)?.id).toBe("fam");
    expect(groupFor(trip(["a", "u"]), dir)?.id).toBe("keg");
    expect(groupFor(trip([]), dir)).toBeNull();
    expect(prefsFor(trip(["a", "u"]), dir)).toMatchObject({ stayType: "hotel", maxStops: 0, avoid: ["TR"] });
    expect(prefsFor(null, dir).stayType).toBe("all");
  });
  it("Flug über ein gesperrtes Land (Ziel oder Umstieg)", () => {
    const o = { out: { from: "DUS", to: "CAI", route: ["DUS", "IST", "CAI"] } } as unknown as FlightOffer;
    const cc = (c: string) => ({ DUS: "DE", IST: "TR", CAI: "EG" })[c];
    expect(touchesAvoided(o, ["TR"], cc)).toBe(true);
    expect(touchesAvoided(o, ["EG"], cc)).toBe(true);
    expect(touchesAvoided(o, ["GR"], cc)).toBe(false);
    expect(touchesAvoided(o, [], cc)).toBe(false);
  });
  it("für die KI nur Vorlieben, keine leeren Felder", () => {
    expect(agentPrefs({ avoid: [], styles: ["city"], note: "x".repeat(400) })).toEqual({ styles: ["city"], note: "x".repeat(300) });
    expect(agentPrefs({})).toBeUndefined();
  });
  it("Postleitzahl bleibt bei den eigenen Vorlieben und geht nicht an die KI", () => {
    expect(prefsFor(null, { ...dir, prefs: { plz: "12345" } }).plz).toBe("12345");
    expect(agentPrefs({ plz: "12345" })).toBeUndefined();
  });
});
