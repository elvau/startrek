import { describe, expect, it } from "vitest";
import { validUntil } from "./borders";

describe("Pass-Gültigkeit", () => {
  it("Monatsende: 31. August + 6 Monate endet am letzten Tag des Zielmonats", () => {
    expect(validUntil({ months: 6, from: "entry" }, "2027-08-31", "2027-09-05")).toBe("2028-02-29");
    expect(validUntil({ months: 6, from: "entry" }, "2027-01-31", "2027-02-05")).toBe("2027-07-31");
  });
  it("normaler Tag bleibt, mindestens bis zum Reiseende", () => {
    expect(validUntil({ months: 3, from: "exit" }, "2027-07-10", "2027-07-20")).toBe("2027-10-20");
    expect(validUntil(undefined, "2027-07-10", "2027-07-20")).toBe("2027-07-20");
  });
});
