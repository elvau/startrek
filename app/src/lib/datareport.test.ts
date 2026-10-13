import { describe, expect, it } from "vitest";
import { accountJson, reportHtml } from "./datareport";
import type { AccountData } from "./cloud/firebase";

const data: AccountData = {
  account: { uid: "u1", email: "kira@test.de", name: "Kira", providers: ["password"], verified: true, created: "Tue, 13 Oct 2026 10:00:00 GMT", lastSignIn: "Tue, 13 Oct 2026 11:00:00 GMT" },
  profile: JSON.stringify({ people: [{ id: "p1", first: "Kira", last: "<Muster>", age: 34, home: { plz: "47906", ort: "Kempen", cc: "DE" } }], groups: [{ id: "g1", name: "Familie", memberIds: ["p1"] }], me: "p1", prefs: { pet: true, avoid: ["RU"] }, terms: { v: "2026-10-13", at: "2026-10-13" } }),
  travelDocs: JSON.stringify({ p1: { passNo: "C01X00T47", passExpiry: "2030-01-01" } }),
  trips: [{ id: "t1", name: "Mallorca", data: JSON.stringify({ place: "Palma", from: "2027-05-07", to: "2027-05-14", travelers: [{ id: "a", name: "Kira", age: 34, household: "h" }], items: [{}, {}], expenses: [{}] }), owner: "u1", memberIds: ["u1"], members: { u1: "owner" }, memberNames: { u1: "Kira" }, invite: { role: "viewer" } }],
  campaigns: [{ id: "c1", owner: "u1", trip: "t1", title: "Kasse", text: "", place: "", from: "", to: "", goal: 100, raised: 0, pledged: 0, paypal: "kira", link: "" }]
};

describe("Auskunft (Art. 15 DSGVO)", () => {
  const html = reportHtml(data, [{ key: "rk2-dir", size: 2048 }], "de", new Date("2026-10-13T12:00:00Z"));
  it("enthält Konto, Personen, Buchungsdaten, Reisen, Aktionsseiten und Gerät", () => {
    for (const x of ["kira@test.de", "Kempen", "C01X00T47", "Gesperrte Länder", "RU", "Haustier", "Mallorca", "Besitzer", "Palma", "2 Posten", "Ausgaben in der Kasse", "Einladungslink aktiv", "Kasse", "rk2-dir", "2,0 KB", "Fassung 2026-10-13"]) expect(html).toContain(x);
  });
  it("Werte werden maskiert (keine HTML-Einschleusung)", () => {
    expect(html).toContain("&lt;Muster&gt;");
    expect(html).not.toContain("<Muster>");
  });
  it("englisch für alle anderen Sprachen", () => {
    expect(reportHtml(data, [], "en")).toContain("Information about your stored data");
  });
  it("JSON-Export: alles als Objekte, Reiseinhalt vollständig", () => {
    const j = JSON.parse(accountJson(data, []));
    expect(j.profile.people[0].first).toBe("Kira");
    expect(j.travelDocs.p1.passNo).toBe("C01X00T47");
    expect(j.trips[0].data.items).toHaveLength(2);
    expect(j.trips[0].invite).toEqual({ role: "viewer" });
  });
});
