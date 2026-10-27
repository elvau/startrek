import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { accounts, forWhom, likeable, stand, undecided, type FamCfg } from "./famvote";

// Familie K: Anna (Konto), Ben (Konto), Bea (ohne Konto), Kind; Familie H: Cleo (Konto)
const trip = (): Trip => ({
  id: "t", name: "Reise", place: "", country: "", items: [], tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [{ id: "a", name: "Anna", household: "K", age: 40, member: "ua" }, { id: "b", name: "Ben", household: "K", age: 42 },
    { id: "e", name: "Bea", household: "K", age: 19 }, { id: "c", name: "Cleo", household: "H", age: 35, member: "uc" }, { id: "k", name: "Kind", household: "K", age: 5 }]
});
const cfg = (m: Record<string, FamCfg & { t?: number }>) => (u: string) => m[u];
const claims = { ub: { t: "b", n: "Ben" } };

describe("Familie stimmt mit (#585)", () => {
  it("Konten aus der Reise und aus „Wer bist du?“", () => {
    const a = accounts(trip(), claims, cfg({ ub: { l: "a" } }));
    expect(Object.keys(a).sort()).toEqual(["a", "b", "c"]);
    expect(a.b).toMatchObject({ uid: "ub", cfg: { l: "a" } });
  });
  it("zählt automatisch für Familienmitglieder ohne Angaben, nicht für andere Familien und Kinder", () => {
    const tr = trip(), acct = accounts(tr, claims, cfg({}));
    const s = stand(tr, acct, id => id === "a");
    expect(s).toEqual({ e: "a", b: "a" });
  });
  it("abgewählt zählt nicht; mehrere Quellen: das neueste Konto", () => {
    const tr = trip();
    expect(stand(tr, accounts(tr, claims, cfg({ ua: { x: ["e"] } })), id => id === "a")).toEqual({ b: "a" });
    const acct = accounts(tr, claims, cfg({ ua: { t: 1 }, ub: { t: 5 } }));
    expect(stand(tr, acct, id => id === "a" || id === "b", id => acct[id]?.at || 0)).toEqual({ e: "b" });
  });
  it("eigene Angaben gehen vor, selbst entschieden: keine Stellvertretung", () => {
    const tr = trip();
    expect(stand(tr, accounts(tr, claims, cfg({})), id => id === "a" || id === "e")).toEqual({ b: "a" });
    expect(stand(tr, accounts(tr, claims, cfg({ ub: { d: true } })), id => id === "a")).toEqual({ e: "a" });
  });
  it("wie Anna folgt auch über eine Kette, ohne Schleife", () => {
    const tr = trip();
    // Ben wie Bea, Bea hat kein Konto und folgt automatisch Anna
    expect(stand(tr, accounts(tr, claims, cfg({ ub: { l: "e" } })), id => id === "a").b).toBe("a");
    // Anna wie Ben, Ben wie Anna, keiner hat Angaben: niemand
    expect(stand(tr, accounts(tr, claims, cfg({ ua: { l: "b" }, ub: { l: "a" } })), () => false)).toEqual({});
    // Ben folgt Anna, Anna hat abgestimmt: zählt trotz „abgewählt“ (Ben hat Konto und folgt selbst)
    expect(stand(tr, accounts(tr, claims, cfg({ ua: { x: ["b"] }, ub: { l: "a" } })), id => id === "a").b).toBe("a");
  });
  it("Auswahl: für wen, wem folgen, noch nicht entschieden", () => {
    const tr = trip(), acct = accounts(tr, claims, cfg({ uc: { d: true } }));
    expect(forWhom(tr, "a", acct).map(x => x.id)).toEqual(["e"]);
    expect(likeable(tr, "a", acct).map(x => x.id)).toEqual(["b"]);
    expect(undecided(acct.b)).toBe(true);
    expect(undecided(acct.c)).toBe(false);
  });
});
