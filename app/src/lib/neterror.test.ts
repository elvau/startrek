import { describe, expect, it } from "vitest";
import { isNetworkError, netMessage } from "./neterror";
import { t } from "./i18n/index.svelte";

describe("netMessage", () => {
  it("übersetzt Verbindungsfehler der Browser", () => {
    for (const m of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "Network request failed"]) {
      expect(isNetworkError(new TypeError(m))).toBe(true);
      expect(netMessage(new TypeError(m))).toBe(t("net.failed"));
    }
  });
  it("lässt andere Meldungen unverändert", () => {
    expect(netMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
    expect(netMessage(new Error("Such-Dienst antwortet mit 500"))).toBe("Such-Dienst antwortet mit 500");
    expect(netMessage("nur Text")).toBe("nur Text");
  });
});
