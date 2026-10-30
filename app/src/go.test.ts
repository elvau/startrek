import { describe, expect, it } from "vitest";
import { shownTarget } from "./go";

describe("Weiterleitung (go)", () => {
  const tok = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + ".sig";
  it("zeigt nur https-Ziele aus dem Link", () => {
    expect(shownTarget(tok({ u: "https://kiwi.com/x?a=1", p: "kiwi-com", c: "flights" }))).toBe("https://kiwi.com/x?a=1");
    expect(shownTarget(tok({ u: "javascript:alert(1)" }))).toBe("");
    expect(shownTarget("kaputt")).toBe("");
  });
});
