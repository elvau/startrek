import { describe, expect, it } from "vitest";
import { countVisits } from "./visits";

describe("countVisits", () => {
  it("zählt nur in Produktion", () => {
    expect(countVisits("splitandfly.com", false)).toBe(true);
    expect(countVisits("www.splitandfly.com", false)).toBe(true);
  });
  it("nicht auf Testumgebung, lokal oder im Emulator", () => {
    expect(countVisits("elvau.github.io", false)).toBe(false);
    expect(countVisits("localhost", false)).toBe(false);
    expect(countVisits("splitandfly.com", true)).toBe(false);
  });
});
