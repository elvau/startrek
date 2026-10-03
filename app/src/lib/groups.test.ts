import { describe, expect, it } from "vitest";
import { cluster, groupLabel, near, perPerson, shareGroups } from "./groups";
import type { HouseholdShare } from "./calc";

const sh = (name: string, n: number, flights: number, stay: number): HouseholdShare => ({
  name, members: Array.from({ length: n }, (_, i) => ({ t: { id: name + i, name: name + i, household: name }, v: 0 })),
  total: flights + stay, costs: flights + stay, funds: [], fixed: 0, open: flights + stay,
  cats: [{ cat: "flights", sum: flights, lines: [] }, { cat: "stay", sum: stay, lines: [] }]
});

describe("Gruppen", () => {
  it("fast gleich: 5 € oder 3 %", () => {
    expect(near(100, 104)).toBe(true); expect(near(100, 106)).toBe(false); expect(near(1000, 1025)).toBe(true);
  });
  it("je Person fast gleich: eine Zeile, auch Familien mit mehreren Personen", () => {
    const g = shareGroups([sh("A", 1, 300, 290), sh("B", 1, 312, 290), sh("C", 2, 600, 580), sh("D", 1, 300, 291), sh("E", 1, 500, 290)]);
    expect(g.map(x => x.shares.map(h => h.name).join())).toEqual(["A,B,C,D", "E"]);
    expect(g[0].exact).toBe(false);
    expect(perPerson(g[0], h => h.total)).toBeCloseTo((590 + 602 + 1180 + 591) / 5);
  });
  it("Name der Gruppe", () => {
    expect(groupLabel(["A", "B", "C"], 3)).toBe("Alle (3)");
    expect(groupLabel(["A", "B", "C", "D"], 9)).toBe("A, B +2");
    expect(groupLabel(["A", "B"], 9)).toBe("A, B");
    expect(cluster([1, 2, 1, 3, 2], (a, b) => a === b)).toEqual([[1, 1], [2, 2], [3]]);
  });
});
