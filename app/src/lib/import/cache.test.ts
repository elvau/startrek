import { describe, expect, it } from "vitest";
import { cacheable, expiryOf, inputKey, normUrl, offerKey } from "./cache";
import type { ImportedOffer } from "./ai";

const o: ImportedOffer = { kind: "package", provider: "Anbieter", place: "Palma", from: "2027-05-10", to: "2027-05-17", price: { total: 796, currency: "EUR" }, stay: { name: "Hotel Sol" }, flights: { legs: [{ dir: "out", from: "DUS", to: "PMI", dep: "2027-05-10T06:10" }] } };

describe("Angebotsspeicher (#462)", () => {
  it("Link ohne Werbe-Parameter und Anker, Host klein, Parameter sortiert", () => {
    expect(normUrl("https://Example.com/deal/?utm_source=x&b=2&a=1&fbclid=y#top")).toBe("https://example.com/deal?a=1&b=2");
  });
  it("gleiche Eingabe → gleicher Schlüssel; Text unabhängig von Leerzeichen und Groß-/Kleinschreibung", async () => {
    const a = await inputKey({ url: "https://example.com/deal?utm_medium=a", files: [], lang: "de" });
    expect(a).toBe(await inputKey({ url: "https://example.com/deal", files: [], lang: "en" }));
    expect(await inputKey({ text: "Mallorca  7 Nächte", files: [], lang: "de" })).toBe(await inputKey({ text: "mallorca 7 nächte", files: [], lang: "de" }));
    expect(a).not.toBe(await inputKey({ files: [{ mime: "image/png", data: "AAAA" }], lang: "de" }));
  });
  it("Angebots-Schlüssel aus den Daten, unabhängig von Sicherheit und Titel", async () => {
    expect(await offerKey(o)).toBe(await offerKey({ ...o, title: "Anders", confidence: { place: 0.3 } }));
    expect(await offerKey(o)).not.toBe(await offerKey({ ...o, price: { total: 799 } }));
  });
  it("Teilnehmerlisten nie; Ablauf: gültig bis, sonst Reisedatum, höchstens 14 Tage", () => {
    expect(cacheable(o)).toBe(true);
    expect(cacheable({ ...o, travelers: [{ name: "Anna" }] })).toBe(false);
    expect(expiryOf({ ...o, validUntil: "2026-10-25" }, "2026-10-20")).toBe("2026-10-25");
    expect(expiryOf(o, "2026-10-20")).toBe("2026-11-03");
    expect(expiryOf({ kind: "other", from: "2026-10-22" }, "2026-10-20")).toBe("2026-10-22");
    expect(expiryOf({ kind: "other", validUntil: "2026-10-01" }, "2026-10-20")).toBeNull();
  });
});
