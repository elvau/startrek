import { afterEach, describe, expect, it, vi } from "vitest";
import { today } from "./today";

describe("today (Ortszeit)", () => {
  afterEach(() => vi.useRealTimers());
  it("liefert den lokalen Tag, auch kurz nach Mitternacht", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 0, 30)); // 00:30 Ortszeit
    expect(today()).toBe("2026-01-05");
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    expect(today()).toBe("2026-12-31");
  });
  it("nimmt ein übergebenes Datum", () => {
    expect(today(new Date(2026, 2, 9, 7))).toBe("2026-03-09");
  });
});
