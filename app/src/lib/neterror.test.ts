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

describe("Quellen-Fehler", () => {
  it("errorText liefert bei Verbindungsfehlern den Schlüssel, showError übersetzt ihn", async () => {
    const { errorText } = await import("./netcheck");
    const { showError } = await import("./neterror");
    expect(errorText(new TypeError("Failed to fetch"))).toBe("net.failed");
    expect(errorText(new Error("500"))).toBe("500");
    expect(showError("net.failed")).toBe(t("net.failed"));
    expect(showError("A → B: net.failed")).toBe(`A → B: ${t("net.failed")}`);
    expect(showError("anderer Fehler")).toBe("anderer Fehler");
  });
  it("Flugsuche trägt bei Verbindungsfehler den Schlüssel in die Quelle ein", async () => {
    const { searchAll } = await import("./flights/search");
    const f = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const q = { from: "MUC", to: "LIS", depart: "2027-05-01", adults: 1 } as Parameters<typeof searchAll>[0];
    const r = await searchAll(q, { DUFFEL_TOKEN: "x", KIWI_API_KEY: "x", AMADEUS_ID: "x", AMADEUS_SECRET: "x" } as never, f, 1000);
    const bad = r.sources.filter(s => s.configured && !s.ok);
    for (const s of bad) expect(s.error).toBe("net.failed");
  });
});
