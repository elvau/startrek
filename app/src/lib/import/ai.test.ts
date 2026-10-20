import { describe, expect, it } from "vitest";
import { importFromAi, importPayload, offerUsable, parseImportAi, parseImportRequest } from "./ai";

describe("KI-Antwort prüfen (#457)", () => {
  it("Pauschalreise: bekannte Felder, Grenzen, Datumsformate", () => {
    const o = parseImportAi({
      kind: "package", title: "Mallorca im Mai", provider: "Reiseanbieter", url: "https://example.com/a?b=1", place: "Playa de Palma", country: "es",
      from: "2027-05-17", to: "2027-05-10", nights: 7, adults: 4, childAges: [8, 30, "x"],
      price: { total: 796, perPerson: 199, currency: "eur" }, validUntil: "2026-10-31",
      flights: { legs: [{ dir: "out", from: "DUS", to: "PMI", dep: "2027-05-10T06:10:00", arr: "2027-05-10 08:25", carrier: "Airline" }, { dir: "back", from: "PMI" }, { dir: "back", from: "PMI", to: "DUS", dep: "2027-05-17" }], baggage: { cabin: 1, checked: 7 } },
      stay: { name: "Hotel Sol", stars: 3, board: "breakfast", boards: [{ board: "breakfast", extra: 0 }, { board: "half", extra: 18 }, { board: "half", extra: 20 }, { board: "x" }], freeCancel: "ja" },
      transfer: { included: false }, extras: [{ kind: "citytax", amount: 2, basis: "personNight", pay: "onsite" }, { kind: "bag", amount: 35 }],
      confidence: { place: 0.98, baggage: 0.3, transfer: 7 }, passport: "X123", email: "a@b.c"
    });
    expect(o).toEqual({
      kind: "package", title: "Mallorca im Mai", provider: "Reiseanbieter", url: "https://example.com/a?b=1", place: "Playa de Palma", country: "ES",
      from: "2027-05-10", to: "2027-05-17", nights: 7, adults: 4, childAges: [8],
      price: { total: 796, perPerson: 199, currency: "EUR" }, validUntil: "2026-10-31",
      flights: { legs: [{ dir: "out", from: "DUS", to: "PMI", dep: "2027-05-10T06:10", arr: "2027-05-10T08:25", carrier: "Airline" }, { dir: "back", from: "PMI", to: "DUS", dep: "2027-05-17" }], baggage: { cabin: 1 } },
      stay: { name: "Hotel Sol", stars: 3, board: "breakfast", boards: [{ board: "breakfast", extra: 0 }, { board: "half", extra: 20 }] },
      transfer: { included: false }, extras: [{ kind: "citytax", amount: 2, basis: "personNight", pay: "onsite" }],
      confidence: { place: 0.98, baggage: 0.3 }
    });
    expect(offerUsable(o)).toBe(true);
  });
  it("leer oder Unsinn: nur die Art", () => {
    expect(parseImportAi(null)).toEqual({ kind: "other" });
    expect(parseImportAi({ kind: "cruise", place: " ", url: "javascript:alert(1)" })).toEqual({ kind: "other" });
    expect(offerUsable(parseImportAi({}))).toBe(false);
  });
  it("Teilnehmer aus Listen: nur Name, Familie, Alter", () => {
    expect(parseImportAi({ travelers: [{ name: "Anna", household: "Berg", age: 9, birth: "2018-01-01" }, { age: 3 }] }).travelers).toEqual([{ name: "Anna", household: "Berg", age: 9 }]);
  });
  it("Werkzeugaufruf aus der Antwort", () => {
    const res = { candidates: [{ content: { parts: [{ text: "x" }, { functionCall: { name: "fill_trip", args: { kind: "flight", place: "Rom" } } }] } }] };
    expect(importFromAi(res)).toEqual({ kind: "flight", place: "Rom" });
    expect(importFromAi({})).toEqual({ kind: "other" });
  });
});

describe("Anfrage an den Such-Dienst (#457)", () => {
  it("Text, Link, Dateien mit Grenzen", () => {
    expect(parseImportRequest({})).toBe("Nichts zum Auslesen");
    expect(parseImportRequest({ url: "ftp://x" })).toBe("Link ungültig");
    expect(parseImportRequest({ files: [{ mime: "text/html", data: "AAAA" }] })).toBe("Dateiformat nicht unterstützt");
    expect(parseImportRequest({ files: [{ mime: "image/png", data: "<script>" }] })).toBe("Datei beschädigt");
    expect(parseImportRequest({ files: Array(7).fill({ mime: "image/png", data: "AAAA" }) })).toBe("Höchstens 6 Dateien");
    expect(parseImportRequest({ files: [{ mime: "image/png", data: "A".repeat(5_600_001) }] })).toBe("Datei zu groß");
    expect(parseImportRequest({ text: " Mallorca 7 Nächte ", lang: "en", files: [{ mime: "application/pdf", data: "JVBERi0=" }] }))
      .toEqual({ text: "Mallorca 7 Nächte", files: [{ mime: "application/pdf", data: "JVBERi0=" }], lang: "en" });
    expect(parseImportRequest({ url: "https://example.com/deal", lang: "xx" })).toEqual({ url: "https://example.com/deal", files: [], lang: "de" });
  });
  it("Anfrage an die KI: Dateien als inlineData, ein Werkzeug erzwungen", () => {
    const p = importPayload({ text: "Angebot", url: "https://example.com", files: [{ mime: "image/jpeg", data: "AAAA" }], lang: "de" }, "Seitentext", "2026-10-20");
    expect(p.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
    const txt = (p.contents[0].parts[1] as { text: string }).text;
    expect(txt).toContain("Today is 2026-10-20");
    expect(txt).toContain("Offer link: https://example.com");
    expect(txt).toContain("Seitentext");
    expect(p.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(["fill_trip"]);
  });
});
