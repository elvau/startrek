import { describe, expect, it } from "vitest";
import { convert, fetchEcb, inCurrency, parseEcb } from "./fx";

const XML = `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope><Cube><Cube time='2026-10-01'>
<Cube currency='USD' rate='1.1000'/><Cube currency='GBP' rate='0.8000'/><Cube currency='PLN' rate='4.2500'/></Cube></Cube></gesmes:Envelope>`;

describe("Wechselkurse (EZB)", () => {
  it("XML lesen", () => {
    expect(parseEcb(XML)).toEqual({ date: "2026-10-01", rates: { EUR: 1, USD: 1.1, GBP: 0.8, PLN: 4.25 } });
  });
  it("umrechnen über den Euro", () => {
    const r = parseEcb(XML);
    expect(convert(80, "GBP", "EUR", r)).toBe(100);
    expect(convert(100, "EUR", "PLN", r)).toBe(425);
    expect(convert(80, "GBP", "USD", r)).toBeCloseTo(110);
    expect(convert(5, "XYZ", "EUR", r)).toBeNull();
    expect(convert(5, "EUR", "EUR", null)).toBe(5);
  });
  it("Angebote in die Suchwährung, Original bleibt; ohne Kurs fällt es weg", () => {
    const r = parseEcb(XML);
    const l = inCurrency([{ id: "a", price: 400, currency: "GBP" }, { id: "b", price: 300, currency: "EUR" }, { id: "c", price: 9, currency: "XYZ" }], "price", "EUR", r);
    expect(l).toEqual([{ id: "a", price: 500, currency: "EUR", orig: { amount: 400, currency: "GBP" } }, { id: "b", price: 300, currency: "EUR" }]);
    expect(inCurrency([{ id: "a", total: 400, currency: "GBP" }], "total", "EUR", null)).toEqual([]);
  });
  it("Kurse holen; unvollständige Antwort ist ein Fehler", async () => {
    const full = XML.replace("</Cube></Cube>", Array.from({ length: 10 }, (_, i) => `<Cube currency='X${String.fromCharCode(65 + i)}A' rate='1.5'/>`).join("") + "</Cube></Cube>");
    expect((await fetchEcb((async () => new Response(full)) as unknown as typeof fetch)).rates.USD).toBe(1.1);
    await expect(fetchEcb((async () => new Response(XML)) as unknown as typeof fetch)).rejects.toThrow(/unvollständig/);
  });
});
