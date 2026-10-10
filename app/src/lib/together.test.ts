import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { applyResult, bestPeriods, blockedDays, cycle, hitsBlocked, missing, newPoll, setAvail, tally, vote } from "./together";

const trip = (): Trip => ({
  id: "t", name: "Reise", place: "", country: "", items: [], tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [{ id: "a", name: "Anna", household: "K", age: 40 }, { id: "b", name: "Ben", household: "K", age: 42 }, { id: "c", name: "Cleo", household: "H", age: 35 }, { id: "k", name: "Kind", household: "K", age: 5 }],
  avail: { from: "2027-07-01", to: "2027-07-20", nights: 3, by: {} }
});

describe("Termin finden (#174)", () => {
  it("antippen wechselt kann → vielleicht → kann nicht → offen", () => {
    expect([cycle(undefined), cycle("yes"), cycle("maybe"), cycle("no")]).toEqual(["yes", "maybe", "no", undefined]);
  });

  it("beste Zeiträume: alle können vorn, vielleicht zählt halb, ohne Überschneidung, Kinder zählen nicht", () => {
    const t = trip();
    // Anna kann 3.–6. nicht, Ben 10.–12. vielleicht, Cleo kann 15. nicht
    for (const d of ["2027-07-03", "2027-07-04", "2027-07-05", "2027-07-06"]) setAvail(t, "a", d, "no");
    for (const d of ["2027-07-10", "2027-07-11", "2027-07-12"]) setAvail(t, "b", d, "maybe");
    setAvail(t, "c", "2027-07-15", "no");
    const best = bestPeriods(t);
    expect(best[0]).toMatchObject({ from: "2027-07-16", to: "2027-07-19", score: 3, yes: ["a", "b", "c"] });
    expect(best.find(r => r.maybe.length)).toMatchObject({ score: 2.5, yes: ["a", "c"], maybe: ["b"] });
    expect(best.every((r, i) => best.every((o, j) => i === j || r.to <= o.from || o.to <= r.from))).toBe(true);
    expect(best.flatMap(r => [...r.yes, ...r.maybe, ...r.no, ...r.open])).not.toContain("k");
  });

  it("niemand hat etwas eingetragen: keine Vorschläge; noch offen wird gezeigt", () => {
    const t = trip();
    expect(bestPeriods(t)).toEqual([]);
    setAvail(t, "a", "2027-07-02", "yes");
    expect(bestPeriods(t)[0].open).toEqual(["b", "c"]);
  });

  it("gesperrte Tage für Suche und KI", () => {
    const t = trip();
    setAvail(t, "a", "2027-07-05", "no");
    setAvail(t, "b", "2027-07-06", "maybe");
    const bl = blockedDays(t);
    expect([...bl]).toEqual(["2027-07-05"]);
    expect(hitsBlocked(bl, "2027-07-01", "2027-07-05")).toBe(true);
    expect(hitsBlocked(bl, "2027-07-06", "2027-07-09")).toBe(false);
    expect(blockedDays(t, ["b"]).size).toBe(0);
  });
});

describe("Abstimmen (#175)", () => {
  it("Auszählung: 👍 +1, 👎 −1, egal 0; wer fehlt", () => {
    const t = trip();
    const p = newPoll("Welche Unterkunft?", "free", [{ label: "Villa" }, { label: "Hotel" }]);
    const [v, h] = p.options;
    vote(p, "a", v.id, 1); vote(p, "a", h.id, -1);
    vote(p, "b", v.id, 0); vote(p, "b", h.id, 1);
    expect(tally(p).map(r => [r.label, r.score, r.up, r.meh, r.down])).toEqual([["Villa", 1, 1, 1, 0], ["Hotel", 0, 1, 0, 1]]);
    expect(missing(t, p).map(x => x.name)).toEqual(["Cleo"]);
    vote(p, "b", v.id, undefined); vote(p, "b", h.id, undefined);
    expect(missing(t, p).map(x => x.name)).toEqual(["Ben", "Cleo"]);
  });

  it("Ergebnis übernehmen: Termin als Reisedatum, Angebot gewählt, danach keine Stimmen mehr", () => {
    const t = trip();
    const d = newPoll("Wann?", "dates", [{ label: "Juli", from: "2027-07-07", to: "2027-07-10" }]);
    applyResult(t, d, d.options[0].id);
    expect([t.from, t.to, !!d.closed, d.result]).toEqual(["2027-07-07", "2027-07-10", true, d.options[0].id]);
    vote(d, "a", d.options[0].id, 1);
    expect(d.votes).toEqual({});
    t.items.push({ id: "s", cat: "stay", name: "Unterkunft", status: "idea", options: [{ id: "o1", label: "Villa", price: { mode: "unit", currency: "EUR", unit: 900 } }, { id: "o2", label: "Hotel", price: { mode: "unit", currency: "EUR", unit: 700 } }] });
    const o = newPoll("Welche?", "offers", [{ label: "Villa", itemId: "s", optionId: "o1" }, { label: "Hotel", itemId: "s", optionId: "o2" }]);
    applyResult(t, o, o.options[1].id);
    expect([t.items[0].chosen, t.items[0].status]).toEqual(["o2", "chosen"]);
  });
});
