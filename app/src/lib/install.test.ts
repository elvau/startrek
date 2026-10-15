import { describe, expect, it } from "vitest";
import { isAndroid, isIos } from "./install.svelte";

describe("isIos", () => {
  it("erkennt iPhone und iPad, auch iPadOS als Mac mit Touch", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
  });
  it("nicht am Mac ohne Touch, nicht auf Android", () => {
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5)).toBe(false);
  });
});

describe("isAndroid", () => {
  it("Android ja, iPhone und Desktop nein", () => {
    expect(isAndroid("Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141.0 Mobile Safari/537.36")).toBe(true);
    expect(isAndroid("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(false);
    expect(isAndroid("Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0")).toBe(false);
  });
});
