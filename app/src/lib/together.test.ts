import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { blockValue, brushed, dayRange, monthWeeks, personIn, circles, familyCircles, toggleFamily, notDeciding, setDeciders, voters, variantPoll, variantStand, applyResult, bestPeriods, blockedDays, cycle, dueSoon, hitsBlocked, milesLeft, milesOf, missing, newPoll, planError, nextVote, pollOpen, setAvail, tally, tallyMode, vote, VETO } from "./together";

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
    // alle tragen erst „kann“ ein; Anna kann 3.–6. nicht, Ben 10.–12. vielleicht, Cleo kann 15. nicht
    for (let i = 1; i <= 20; i++) for (const id of ["a", "b", "c"]) setAvail(t, id, `2027-07-${String(i).padStart(2, "0")}`, "yes");
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
    for (const d of ["02", "03", "04", "05"]) setAvail(t, "a", `2027-07-${d}`, "yes");
    expect(bestPeriods(t)[0].open).toEqual(["b", "c"]);
  });

  it("wer nur einzelne Tage mit „kann“ markiert, ist für andere Zeiträume offen, nicht „kann“", () => {
    const t = trip();
    for (const d of ["01", "02", "03", "04", "05"]) setAvail(t, "a", `2027-07-${d}`, "yes");
    const best = bestPeriods(t, 10);
    expect(best.find(r => r.from === "2027-07-20")).toBeUndefined();
    expect(best.every(r => r.yes.includes("a") === (r.to <= "2027-07-05"))).toBe(true);
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

describe("Arten der Abstimmung (#432)", () => {
  const p3 = (mode: "one" | "multi" | "miles", miles?: number) => ({ ...newPoll("Welches Hotel?", "offers", [{ label: "A" }, { label: "B" }, { label: "C" }], mode), ...(miles ? { miles } : {}) });
  it("eine Stimme: Dafür wechselt, „ohne mich“ daneben", () => {
    const p = p3("one");
    const [a, b] = p.options.map(o => o.id);
    let m = nextVote(p, undefined, a, "for");
    m = nextVote(p, m, b, "for");
    expect(m).toEqual({ [b]: 1 });
    m = nextVote(p, m, a, "veto");
    expect(m).toEqual({ [b]: 1, [a]: VETO });
    expect(nextVote(p, m, b, "for")).toEqual({ [a]: VETO });
  });
  it("mehrere Stimmen: jede Möglichkeit für sich", () => {
    const p = p3("multi");
    const [a, b] = p.options.map(o => o.id);
    expect(nextVote(p, nextVote(p, undefined, a, "for"), b, "for")).toEqual({ [a]: 1, [b]: 1 });
  });
  it("Meilen-Wahl: höchstens Möglichkeiten × 5, frei verteilt, auch alle auf eine", () => {
    expect(milesOf(p3("miles", 99))).toBe(15);
    const p = p3("miles", 3);
    const [a, b] = p.options.map(o => o.id);
    let m: Record<string, number> = {};
    for (let i = 0; i < 5; i++) m = nextVote(p, m, a, "more");
    expect(m).toEqual({ [a]: 3 });
    expect(milesLeft(p, m)).toBe(0);
    m = nextVote(p, nextVote(p, m, a, "less"), b, "more");
    expect(m).toEqual({ [a]: 2, [b]: 1 });
  });
  it("Auszählung: Meilen bzw. Stimmen, Personen, ohne mich; zu viele Meilen zählen anteilig", () => {
    const p = p3("miles", 4);
    const [a, b, c] = p.options.map(o => o.id);
    const t = tallyMode(p, { x: { [a]: 4 }, y: { [b]: 2, [a]: 2 }, z: { [c]: VETO, [b]: 8 } });
    expect(t.map(r => [r.label, r.score, r.people, r.veto])).toEqual([["A", 6, 2, []], ["B", 6, 2, []], ["C", 0, 0, ["z"]]]);
    const o = p3("one");
    expect(tallyMode(o, { x: { [o.options[1].id]: 1 }, y: { [o.options[1].id]: 1, [o.options[0].id]: VETO } })[0]).toMatchObject({ label: "B", score: 2, people: 2 });
  });
  it("Frist: offen bis einschließlich zum Tag, „endet bald“ ab dem Vortag", () => {
    const p = { ...p3("one"), due: "2027-05-10" };
    expect(pollOpen(p, "2027-05-10")).toBe(true);
    expect(pollOpen(p, "2027-05-11")).toBe(false);
    expect(dueSoon(p, "2027-05-08")).toBe(false);
    expect(dueSoon(p, "2027-05-09")).toBe(true);
  });
  it("Stimmen aus dem Konto zählen mit, auch bei „noch nicht abgestimmt“", () => {
    const t = trip();
    const p = p3("one");
    expect(missing(t, p, { [t.travelers[0].id]: { [p.options[0].id]: 1 } }).map(x => x.id)).not.toContain(t.travelers[0].id);
  });
});

describe("Abstimmung über Varianten (#432)", () => {
  const p = newPoll("Welche?", "variants", [{ label: "Malle", tripId: "t1" }, { label: "Hamburg", tripId: "t2" }], "one");
  const [a, b] = p.options.map(o => o.id);
  it("findet die offene Abstimmung nur in Varianten", () => {
    expect(variantPoll({ polls: [p], cmp: { id: "c", title: "JGA" } })?.id).toBe(p.id);
    expect(variantPoll({ polls: [p] })).toBeUndefined();
    expect(variantPoll({ polls: [newPoll("x", "free", [{ label: "a" }, { label: "b" }])], cmp: { id: "c", title: "JGA" } })).toBeUndefined();
  });
  it("Stand je Variante: dafür, ohne mich, wie viele abgestimmt haben", () => {
    const st = variantStand(p, { x: { [a]: 1 }, y: { [a]: 1 }, z: { [b]: 1, [a]: -1 } });
    expect(st.byTrip).toEqual({ t1: { for: 2, veto: 1 }, t2: { for: 1, veto: 0 } });
    expect(st.voted).toBe(3);
  });
});

describe("Abstimmung: nur aktuelle Stimmberechtigte (#501)", () => {
  it("Stimmen von Personen, die nicht mehr dabei sind, zählen nicht", () => {
    const t = trip();
    t.travelers.push({ id: "x", name: "Xaver", household: "X", age: 30, active: false }, { id: "y", name: "Yvo", household: "Y", age: 30, active: false });
    const p = newPoll("Wohin?", "free", [{ label: "X" }, { label: "Y" }], "one");
    const [ox, oy] = p.options;
    p.votes = { a: { [ox.id]: 1 }, x: { [oy.id]: 1 }, y: { [oy.id]: 1 } };
    expect(tallyMode(p, p.votes, t)[0]).toMatchObject({ id: ox.id, people: 1 });
    expect(tallyMode(p, p.votes)[0].id).toBe(oy.id);
    expect(tally(p, t)[0]).toMatchObject({ id: ox.id, up: 1 });
    expect(variantStand(p, p.votes, t).voted).toBe(1);
  });
});

describe("Termin finden: Zeitraum prüfen", () => {
  it("Bis vor Von, Reise länger als der Zeitraum, sonst in Ordnung", () => {
    expect(planError("2026-11-05", "2026-10-11", 7)).toBe("order");
    expect(planError("2026-11-05", "2026-11-10", 7)).toBe("nights");
    expect(planError("2026-11-05", "2026-11-12", 7)).toBe("");
    expect(planError("", "2026-11-12", 7)).toBe("");
  });
});

describe("Termin finden: Kalender am Handy", () => {
  it("Monatsblatt Mo–So mit leeren Feldern davor und danach", () => {
    const w = monthWeeks("2027-03");
    expect(w[0]).toEqual(["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05", "2027-03-06", "2027-03-07"]);
    expect(w.length).toBe(5);
    expect(w[4]).toEqual(["2027-03-29", "2027-03-30", "2027-03-31", null, null, null, null]);
    expect(monthWeeks("2027-08")[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(monthWeeks("2027-02").flat().filter(Boolean).length).toBe(28);
  });
  it("Ziehen: Tage zwischen Start und Ende in beide Richtungen, unpassende ausgelassen", () => {
    expect(dayRange("2027-03-07", "2027-03-05")).toEqual(["2027-03-05", "2027-03-06", "2027-03-07"]);
    expect(dayRange("2027-03-05", "2027-03-13", d => d > "2027-03-07" && d < "2027-03-12")).toEqual(["2027-03-05", "2027-03-06", "2027-03-07", "2027-03-12", "2027-03-13"]);
  });
  it("Pinsel: setzt, nimmt Gleiches wieder weg, leeren", () => {
    expect(brushed(undefined, "yes")).toBe("yes");
    expect(brushed("no", "yes")).toBe("yes");
    expect(brushed("yes", "yes")).toBeUndefined();
    expect(brushed("maybe", undefined)).toBeUndefined();
  });
  it("Termin je Person: einheitlich, gemischt oder offen", () => {
    const m = { "2027-03-05": "yes", "2027-03-06": "yes", "2027-03-07": "maybe" } as const;
    expect(blockValue(m, "2027-03-05", "2027-03-06")).toBe("yes");
    expect(blockValue(m, "2027-03-05", "2027-03-07")).toBe("mix");
    expect(blockValue(m, "2027-03-12", "2027-03-14")).toBeUndefined();
    expect(personIn(m, "2027-03-05", "2027-03-07")).toBe("maybe");
  });
});

describe("Wer entscheidet mit (#567)", () => {
  const club = (): Trip => ({
    id: "k", name: "Kegeltour", place: "", country: "", items: [], tiers: {}, settings: {} as Trip["settings"],
    travelers: [
      { id: "a", name: "Monika", household: "A", group: "Kegelclub" }, { id: "b", name: "Daniel", household: "B", group: "Kegelclub" },
      { id: "c", name: "Fabian", household: "A" }, { id: "k", name: "Emily", household: "A", age: 8 }, { id: "x", name: "Ingolf", household: "C", active: false }
    ]
  });
  it("ohne Auswahl alle aktiven Erwachsenen, mit Auswahl nur der Kreis, Kinder nie", () => {
    const t = club();
    expect(voters(t).map(x => x.id)).toEqual(["a", "b", "c"]);
    setDeciders(t, ["a", "b", "k"]);
    expect(t.deciders).toEqual(["a", "b"]);
    expect(voters(t).map(x => x.id)).toEqual(["a", "b"]);
    expect(notDeciding(t).map(x => x.id)).toEqual(["c"]);
  });
  it("alle gewählt oder niemand mehr da: keine Einschränkung", () => {
    const t = club();
    setDeciders(t, ["a", "b", "c"]);
    expect(t.deciders).toBeUndefined();
    t.deciders = ["weg"];
    expect(voters(t).map(x => x.id)).toEqual(["a", "b", "c"]);
  });
  it("Schnellwahl nach Herkunftsgruppe, Rest als Begleitung", () => {
    expect(circles(club())).toEqual([{ key: "Kegelclub", ids: ["a", "b"] }, { key: "", ids: ["c"] }]);
  });
  it("Schnellwahl je Familie: Erwachsene je Haushalt, Kinder und Inaktive nicht (#576)", () => {
    expect(familyCircles(club())).toEqual([{ key: "A", ids: ["a", "c"] }, { key: "B", ids: ["b"] }]);
    expect(familyCircles({ ...club(), travelers: club().travelers.filter(x => x.household === "A") })).toEqual([]);
  });
  it("Familie umschalten: dazu, wenn nicht ganz drin, sonst raus; Rest bleibt (#576)", () => {
    expect(toggleFamily(["b"], ["a", "c"])).toEqual(["b", "a", "c"]);
    expect(toggleFamily(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
    expect(toggleFamily(["a", "b"], ["a", "c"])).toEqual(["a", "b", "c"]);
  });
});
