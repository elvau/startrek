import { describe, expect, it } from "vitest";
import { campaignDoc, campaignLink, campaignProblem, cleanPaypal, epcPayload, fetchCampaign, formatIban, fromRest, utf8Binary, validIban, type Campaign } from "./campaign";

const c: Campaign = { id: "abc123def456ghi", title: "Kegeltour Mallorca", text: "Danke!", holder: "Anna Klein", iban: "de89 3704 0044 0532 0130 00", paypal: "https://paypal.me/AnnaK" };

describe("Aktionsseite", () => {
  it("IBAN mit Prüfsumme, Vierergruppen", () => {
    expect(validIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(validIban("DE88 3704 0044 0532 0130 00")).toBe(false);
    expect(validIban("AT61 1904 3002 3457 3201")).toBe(true);
    expect(validIban("123")).toBe(false);
    expect(formatIban("de89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
  });
  it("PayPal.me-Name aus Link oder Name", () => {
    expect(cleanPaypal("https://www.paypal.me/AnnaK/20")).toBe("AnnaK");
    expect(cleanPaypal("AnnaK")).toBe("AnnaK");
    expect(cleanPaypal("Anna K")).toBe("");
  });
  it("GiroCode nach EPC069-12: ohne Betrag, Zweck höchstens 140 Zeichen", () => {
    const p = epcPayload({ holder: "Anna Klein", iban: c.iban, purpose: "Kegeltour Mallorca" }).split("\n");
    expect(p).toEqual(["BCD", "002", "1", "SCT", "", "Anna Klein", "DE89370400440532013000", "", "", "", "Kegeltour Mallorca"]);
    expect(epcPayload({ holder: "A", iban: c.iban, purpose: "x".repeat(200), amount: 25 }).split("\n")).toContain("EUR25.00");
    expect(epcPayload({ holder: "A", iban: c.iban, purpose: "x".repeat(200) }).split("\n")[10]).toHaveLength(140);
    // Umlaute als UTF-8-Bytes
    expect(utf8Binary("ü")).toBe("Ã¼");
  });
  it("öffentlicher Inhalt: Ziel aus den Reisekosten, keine Mitreisenden", () => {
    const d = campaignDoc(c, { id: "t1", place: "Palma", from: "2027-05-13", to: "2027-05-16" }, { total: 3827.456, raised: 200, pledged: 450 }, "u1");
    expect(d).toEqual({ owner: "u1", trip: "t1", title: "Kegeltour Mallorca", text: "Danke!", place: "Palma", from: "2027-05-13", to: "2027-05-16",
      goal: 3827, raised: 200, pledged: 450, holder: "Anna Klein", iban: "DE89370400440532013000", paypal: "AnnaK" });
    expect(campaignDoc({ ...c, goal: 1000 }, { id: "t1" }, { total: 5000, raised: 0, pledged: 0 }, "u1").goal).toBe(1000);
  });
  it("vor dem Veröffentlichen: Titel, Kontoinhaber, IBAN, Einwilligung", () => {
    expect(campaignProblem(c, true)).toBeNull();
    expect(campaignProblem({ ...c, title: " " }, true)).toBe("cmp.errTitle");
    expect(campaignProblem({ ...c, iban: "DE00 1234" }, true)).toBe("cmp.errIban");
    expect(campaignProblem({ ...c, paypal: "mit Leerzeichen" }, true)).toBe("cmp.errPaypal");
    expect(campaignProblem(c, false)).toBe("cmp.errConsent");
  });
  it("Link und öffentliches Lesen über REST", async () => {
    expect(campaignLink("abc", "https://splitandfly.com")).toBe("https://splitandfly.com/?aktion=abc");
    const rest = { fields: { title: { stringValue: "T" }, goal: { integerValue: "1000" }, raised: { doubleValue: 12.5 }, iban: { stringValue: "DE89370400440532013000" }, updatedAt: { timestampValue: "2026-10-02T10:00:00Z" } } };
    expect(fromRest(rest)).toMatchObject({ title: "T", goal: 1000, raised: 12.5, pledged: 0, paypal: "", updated: "2026-10-02T10:00:00Z" });
    expect(fromRest({})).toBeNull();
    const ok = (async () => new Response(JSON.stringify(rest), { status: 200 })) as unknown as typeof fetch;
    expect((await fetchCampaign("abc123def456ghi", ok))?.title).toBe("T");
    const gone = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchCampaign("abc123def456ghi", gone)).toBeNull();
    // ungültige Kennung: gar nicht erst fragen
    expect(await fetchCampaign("../trips/x", ok)).toBeNull();
  });
});
