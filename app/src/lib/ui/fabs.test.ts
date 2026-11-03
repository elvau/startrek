import { describe, expect, it } from "vitest";
import { fabState } from "./fabs";

describe("schwebende Knöpfe beim Scrollen (#663)", () => {
  it("herunter weg, hoch da, oben und beim seitlichen Wechsel da, kleine Bewegung unverändert", () => {
    expect(fabState(100, 200)).toBe(true);
    expect(fabState(300, 200)).toBe(false);
    expect(fabState(100, 40)).toBe(false);
    expect(fabState(200, 202)).toBeNull();
    expect(fabState(200, 260, 0, 390)).toBe(false);
    expect(fabState(200, 200, 0, 40)).toBeNull();
  });
});
