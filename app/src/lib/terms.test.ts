import { describe, expect, it } from "vitest";
import { accept, newerTerms, takePending, TERMS_VERSION, termsAccepted, waitForServer } from "./terms";
import type { Directory } from "./model";

describe("AGB-Zustimmung", () => {
  it("gilt nur für die aktuelle Fassung", () => {
    const d: Directory = { people: [], groups: [] };
    expect(termsAccepted(d)).toBe(false);
    accept(d, new Date("2026-10-13T10:00:00Z"));
    expect(d.terms).toEqual({ v: TERMS_VERSION, at: "2026-10-13" });
    expect(termsAccepted(d)).toBe(true);
    expect(termsAccepted({ terms: { v: "2020-01-01", at: "2020-01-01" } })).toBe(false);
  });
  it("beim Zusammenführen gewinnt die neuere Zustimmung", () => {
    const old = { v: "2026-01-01", at: "2026-02-01" }, cur = { v: TERMS_VERSION, at: "2026-10-13" };
    expect(newerTerms(old, cur)).toBe(cur);
    expect(newerTerms(cur, old)).toBe(cur);
    expect(newerTerms(undefined, old)).toBe(old);
    expect(newerTerms()).toBeUndefined();
  });
  it("ohne Haken im Anmeldefenster keine Zustimmung", () => {
    const d: Directory = { people: [], groups: [] };
    expect(takePending(d)).toBe(false);
    expect(d.terms).toBeUndefined();
  });
});

describe("Stand aus dem Zwischenspeicher", () => {
  const ok = JSON.stringify({ people: [], groups: [], terms: { v: TERMS_VERSION, at: "2026-10-13" } });
  it("wartet auf den Server, wenn die Zustimmung im Zwischenspeicher fehlt", () => {
    expect(waitForServer(null, true)).toBe(true);
    expect(waitForServer(JSON.stringify({ people: [], groups: [] }), true)).toBe(true);
    expect(waitForServer("kaputt", true)).toBe(true);
  });
  it("nimmt Stände vom Server und Zwischenspeicher mit Zustimmung sofort", () => {
    expect(waitForServer(null, false)).toBe(false);
    expect(waitForServer(ok, true)).toBe(false);
  });
});
