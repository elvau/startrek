import { describe, expect, it } from "vitest";
import { campaignDoc, campaignLink, campaignProblem, cleanLink, cleanPaypal, fetchCampaign, fromRest, linkSite, type Campaign } from "./campaign";

const c: Campaign = { id: "abc123def456ghi", title: "Kegeltour Mallorca", text: "Danke!", paypal: "https://paypal.me/AnnaK", link: "" };

describe("Aktionsseite", () => {
  it("PayPal.me-Name aus Link oder Name", () => {
    expect(cleanPaypal("https://www.paypal.me/AnnaK/20")).toBe("AnnaK");
    expect(cleanPaypal("AnnaK")).toBe("AnnaK");
    expect(cleanPaypal("Anna K")).toBe("");
  });
  it("Sammelaktion nur bei bekannten Anbietern, immer https", () => {
    expect(cleanLink("gofund.me/abc123")).toBe("https://gofund.me/abc123");
    expect(cleanLink("http://www.leetchi.com/de/c/kegeltour?x=1")).toBe("https://leetchi.com/de/c/kegeltour?x=1");
    expect(cleanLink("https://evil.example/gofundme.com/x")).toBe("");
    expect(cleanLink("https://gofundme.com.evil.example/x")).toBe("");
    expect(cleanLink("https://user:pw@gofundme.com/x")).toBe("");
    expect(cleanLink("https://gofundme.com/")).toBe("");
    expect(cleanLink("javascript:alert(1)")).toBe("");
    expect(linkSite("https://gofund.me/abc")).toBe("GoFundMe");
  });
  it("öffentlicher Inhalt: Ziel aus den Reisekosten, keine Mitreisenden", () => {
    // alte Reisen mit Kontoinhaber und IBAN: beides geht nicht mehr an die öffentliche Seite
    const d = campaignDoc({ ...c, holder: "Anna Klein", iban: "DE89370400440532013000" }, { id: "t1", place: "Palma", from: "2027-05-13", to: "2027-05-16" }, { total: 3827.456, raised: 200, pledged: 450 }, "u1");
    expect(d).toEqual({ owner: "u1", trip: "t1", title: "Kegeltour Mallorca", text: "Danke!", place: "Palma", from: "2027-05-13", to: "2027-05-16",
      goal: 3827, raised: 200, pledged: 450, paypal: "AnnaK", link: "" });
    expect(campaignDoc({ ...c, goal: 1000 }, { id: "t1" }, { total: 5000, raised: 0, pledged: 0 }, "u1").goal).toBe(1000);
  });
  it("vor dem Veröffentlichen: Titel, PayPal.me oder Sammelaktion, Einwilligung", () => {
    expect(campaignProblem(c, true)).toBeNull();
    expect(campaignProblem({ ...c, title: " " }, true)).toBe("cmp.errTitle");
    expect(campaignProblem({ ...c, paypal: "", link: "https://gofund.me/x" }, true)).toBeNull();
    expect(campaignProblem({ ...c, paypal: "" }, true)).toBe("cmp.errMethod");
    expect(campaignProblem({ ...c, link: "https://example.com/x" }, true)).toBe("cmp.errLink");
    expect(campaignProblem({ ...c, paypal: "mit Leerzeichen" }, true)).toBe("cmp.errPaypal");
    expect(campaignProblem(c, false)).toBe("cmp.errConsent");
  });
  it("Link und öffentliches Lesen über REST", async () => {
    expect(campaignLink("abc", "https://splitandfly.com")).toBe("https://splitandfly.com/?aktion=abc");
    const rest = { fields: { title: { stringValue: "T" }, goal: { integerValue: "1000" }, raised: { doubleValue: 12.5 }, link: { stringValue: "https://example.com/x" }, updatedAt: { timestampValue: "2026-10-02T10:00:00Z" } } };
    expect(fromRest(rest)).toMatchObject({ title: "T", goal: 1000, raised: 12.5, pledged: 0, paypal: "", link: "", updated: "2026-10-02T10:00:00Z" });
    expect(fromRest({})).toBeNull();
    const ok = (async () => new Response(JSON.stringify(rest), { status: 200 })) as unknown as typeof fetch;
    expect((await fetchCampaign("abc123def456ghi", ok))?.title).toBe("T");
    const gone = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchCampaign("abc123def456ghi", gone)).toBeNull();
    // ungültige Kennung: gar nicht erst fragen
    expect(await fetchCampaign("../trips/x", ok)).toBeNull();
  });
});
