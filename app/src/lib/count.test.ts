import { describe, expect, it } from "vitest";
import { clampCount } from "./count";

describe("clampCount", () => {
  it("übernimmt gültige Zahlen", () => expect(clampCount("12", 1, 40, 6)).toBe(12));
  it("begrenzt nach oben und unten", () => {
    expect(clampCount("99", 1, 40, 6)).toBe(40);
    expect(clampCount("0", 1, 40, 6)).toBe(1);
    expect(clampCount(-3, 0, 20, 2)).toBe(0);
  });
  it("rundet Kommazahlen", () => expect(clampCount("2.6", 1, 40, 6)).toBe(3));
  it("behält bei ungültiger Eingabe den alten Wert", () => {
    expect(clampCount("", 1, 40, 6)).toBe(6);
    expect(clampCount("abc", 1, 40, 6)).toBe(6);
    expect(clampCount(null, 1, 40, 6)).toBe(6);
    expect(clampCount("Infinity", 1, 40, 6)).toBe(6);
  });
});
