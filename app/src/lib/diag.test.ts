import { describe, expect, it } from "vitest";
import { rect, tag, wantsDiag } from "./diag";

describe("Diagnose (#612)", () => {
  it("nur mit ?diag", () => {
    expect(wantsDiag("?diag")).toBe(true);
    expect(wantsDiag("?aktion=x&diag=1")).toBe(true);
    expect(wantsDiag("")).toBe(false);
    expect(wantsDiag("?diagnose")).toBe(false);
  });
  it("Kurzname ohne Text, mit Kapitel", () => {
    const el = { tagName: "SECTION", classList: ["chapter", "pg-hero", "on", "x"], getAttribute: (k: string) => (k === "data-ch" ? "hero" : null) };
    expect(tag(el)).toBe("section.chapter.pg-hero.on[hero]");
    expect(tag(null)).toBe("–");
  });
  it("Rechteck gerundet", () => {
    expect(rect({ x: 0.4, y: 62.6, width: 390, height: 721.2 })).toBe("0,63 390×721");
    expect(rect(null)).toBe("–");
  });
});

