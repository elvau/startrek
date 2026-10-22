/*
 * Use Cases „Gemeinsam planen“: Termin finden mit Lücken und Grenzen, Abstimmen mit Wechsel der Art,
 * Personen, die nicht mehr dabei sind.
 */
import { describe, expect, it } from "vitest";
import { applyResult, bestPeriods, hitsBlocked, blockedDays, milesLeft, milesOf, missing, newPoll, nextVote, planDays, setAvail, tally, tallyMode, vote, voters, type Poll } from "./together";
import { DEFAULT_SETTINGS, type Traveler, type Trip } from "./model";

const P = (id: string, age: number | null, x: Partial<Traveler> = {}): Traveler => ({ id, name: id, age, household: id, ...x });
const trip = (x: Partial<Trip> = {}): Trip => ({ id: "t", name: "T", place: "", country: "", travelers: [P("a", 40), P("b", 40), P("c", 40), P("k", 8)], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, ...x });
const poll = (mode?: Poll["mode"]): Poll => ({ id: "p", q: "?", kind: "free", mode, options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }, { id: "z", label: "Z" }], votes: {} });

describe("Termin finden", () => {
  it("Planungszeitraum: höchstens 120 Tage, verkehrt herum leer", () => {
    expect(planDays({ from: "2027-01-01", to: "2028-01-01" }).length).toBe(120);
    expect(planDays({ from: "2027-01-05", to: "2027-01-01" })).toEqual([]);
    expect(planDays({ from: "2027-01-01", to: "2027-01-01" })).toEqual(["2027-01-01"]);
    expect(planDays({ from: "2027-1-1", to: "2027-01-05" })).toEqual([]);
  });
  it("Zeitraum genau so lang wie gewünscht", () => {
    const tr = trip({ avail: { from: "2027-07-01", to: "2027-07-08", nights: 7, by: { a: { "2027-07-03": "yes" } } } });
    expect(bestPeriods(tr).map(p => [p.from, p.to])).toEqual([["2027-07-01", "2027-07-08"]]);
  });
  it("gewünscht länger als der Zeitraum: keine Vorschläge", () => {
    const tr = trip({ avail: { from: "2027-07-01", to: "2027-07-05", nights: 7, by: { a: { "2027-07-03": "yes" } } } });
    expect(bestPeriods(tr)).toEqual([]);
  });
  it("„kann nicht“ am Abreisetag schließt den Zeitraum aus", () => {
    const tr = trip({ avail: { from: "2027-07-01", to: "2027-07-10", nights: 3, by: { a: { "2027-07-04": "no" } } } });
    const best = bestPeriods(tr, 10);
    expect(best.every(p => !(p.from <= "2027-07-04" && "2027-07-04" <= p.to) || p.no.includes("a"))).toBe(true);
    expect(best[0].no).toEqual([]);
  });
  it("Kinder stimmen nicht mit, Inaktive auch nicht", () => {
    const tr = trip(); tr.travelers[2].active = false;
    expect(voters(tr).map(x => x.id)).toEqual(["a", "b"]);
  });
  it("Eintrag löschen räumt die Person auf", () => {
    const tr = trip({ avail: { from: "2027-07-01", to: "2027-07-10", nights: 3, by: {} } });
    setAvail(tr, "a", "2027-07-02", "no");
    setAvail(tr, "a", "2027-07-02", undefined);
    expect(tr.avail!.by).toEqual({});
  });
  it("ohne Planung: setAvail macht nichts", () => {
    const tr = trip();
    setAvail(tr, "a", "2027-07-02", "no");
    expect(tr.avail).toBeUndefined();
  });
  it("gesperrte Tage nur der genannten Personen", () => {
    const tr = trip({ avail: { from: "2027-07-01", to: "2027-07-10", nights: 3, by: { a: { "2027-07-02": "no" }, b: { "2027-07-05": "no", "2027-07-06": "maybe" } } } });
    expect([...blockedDays(tr, ["b"])]).toEqual(["2027-07-05"]);
    expect(hitsBlocked(blockedDays(tr), "2027-07-03", "2027-07-04")).toBe(false);
    expect(hitsBlocked(blockedDays(tr), "2027-07-04", "2027-07-05")).toBe(true);
    expect(hitsBlocked(blockedDays(tr), "kaputt", "2027-07-05")).toBe(false);
  });
  it.fails("wer nur einzelne Tage mit „kann“ markiert, gilt außerhalb davon nicht als „kann“ (#500)", () => {
    // a kann nur in der ersten Woche (so eingetragen), b hat nichts eingetragen
    const by = { a: Object.fromEntries(["01", "02", "03", "04", "05"].map(d => [`2027-07-${d}`, "yes" as const])) };
    const tr = trip({ avail: { from: "2027-07-01", to: "2027-07-31", nights: 4, by } });
    const late = bestPeriods(tr, 10).find(p => p.from >= "2027-07-20");
    expect(late).toBeDefined();
    expect(late!.yes).not.toContain("a");
  });
});

describe("Abstimmen", () => {
  it("neue Abstimmung: höchstens 8 Möglichkeiten, Texte gekürzt", () => {
    const p = newPoll("  " + "x".repeat(300), "free", Array.from({ length: 12 }, (_, i) => ({ label: " " + i + " " })));
    expect(p.q.length).toBe(200);
    expect(p.options.length).toBe(8);
    expect(p.options[0].label).toBe("0");
  });
  it("abgeschlossen: keine Stimmen mehr", () => {
    const p = poll(); p.closed = "2027-01-01";
    vote(p, "a", "x", 1);
    expect(p.votes).toEqual({});
  });
  it("Gleichstand: weniger 👎 vorn, dann Reihenfolge", () => {
    const p = poll();
    vote(p, "a", "x", 1); vote(p, "b", "x", -1); vote(p, "c", "x", 1); // x: 2 up, 1 down → 1
    vote(p, "a", "y", 1); // y: 1
    expect(tally(p).map(r => r.id)).toEqual(["y", "x", "z"]);
  });
  it("eine Stimme: Wechsel nimmt die alte zurück, Veto bleibt", () => {
    const p = poll("one");
    let m = nextVote(p, {}, "x", "veto");
    m = nextVote(p, m, "y", "for");
    m = nextVote(p, m, "z", "for");
    expect(m).toEqual({ x: -1, z: 1 });
  });
  it("Meilen: nicht mehr als erlaubt, weniger bis 0", () => {
    const p = poll("miles"); p.miles = 2;
    let m = nextVote(p, {}, "x", "more");
    m = nextVote(p, m, "x", "more");
    m = nextVote(p, m, "y", "more");
    expect(m).toEqual({ x: 2 });
    expect(milesLeft(p, m)).toBe(0);
    m = nextVote(p, m, "x", "less"); m = nextVote(p, m, "x", "less"); m = nextVote(p, m, "x", "less");
    expect(m).toEqual({});
  });
  it("Meilen-Grenze: mindestens 1, höchstens Möglichkeiten × 5", () => {
    const p = poll("miles");
    p.miles = 0; expect(milesOf(p)).toBe(1);
    p.miles = 100; expect(milesOf(p)).toBe(15);
    p.miles = undefined; expect(milesOf(p)).toBe(10);
  });
  it("Meilen nachträglich gesenkt: zählt anteilig", () => {
    const p = poll("miles"); p.miles = 2;
    p.votes = { a: { x: 4 } };
    expect(tallyMode(p)[0]).toMatchObject({ id: "x", score: 2, people: 1 });
  });
  it("Veto in der Auszählung, beste zuerst", () => {
    const p = poll("multi");
    p.votes = { a: { x: 1, y: -1 }, b: { y: 1 }, c: { y: 1, z: 1 } };
    expect(tallyMode(p).map(r => [r.id, r.people, r.veto.length])).toEqual([["y", 2, 1], ["x", 1, 0], ["z", 1, 0]]);
  });
  it("wer fehlt, mit Stimmen aus dem Konto", () => {
    const tr = trip(), p = poll();
    vote(p, "a", "x", 1);
    expect(missing(tr, p, { b: { y: 0 } }).map(x => x.id)).toEqual(["c"]);
  });
  it.fails("Stimmen von Personen, die nicht mehr dabei sind, zählen nicht mit (#501)", () => {
    const tr = trip(), p = poll("one");
    p.votes = { a: { x: 1 }, weg: { y: 1 }, weg2: { y: 1 } };
    tr.polls = [p];
    // „weg“ und „weg2“ stehen nicht mehr in der Reise: x müsste vorn liegen
    expect(tallyMode(p)[0].id).toBe("x");
  });
  it("Ergebnis übernehmen: Termin ohne gültige Daten ändert die Reise nicht", () => {
    const tr = trip({ from: "2027-01-01", to: "2027-01-05" });
    const p: Poll = { id: "p", q: "", kind: "dates", options: [{ id: "x", label: "", from: "2027-07-01" }], votes: {} };
    applyResult(tr, p, "x");
    expect([tr.from, tr.to]).toEqual(["2027-01-01", "2027-01-05"]);
    expect(p.result).toBe("x");
  });
  it("Ergebnis übernehmen: Angebot, das es nicht mehr gibt, wählt nichts", () => {
    const tr = trip({ items: [{ id: "i", cat: "stay", name: "", status: "idea", options: [{ id: "o1", label: "", price: { mode: "unit", currency: "EUR", unit: 1 } }] }] });
    const p: Poll = { id: "p", q: "", kind: "offers", options: [{ id: "x", label: "", itemId: "i", optionId: "weg" }], votes: {} };
    applyResult(tr, p, "x");
    expect(tr.items[0].chosen).toBeUndefined();
    expect(tr.items[0].status).toBe("idea");
  });
  it("unbekannte Möglichkeit: Abstimmung bleibt offen", () => {
    const tr = trip(), p = poll();
    applyResult(tr, p, "gibtsnicht");
    expect(p.closed).toBeUndefined();
  });
});
