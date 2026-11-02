import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { tripToCatalog } from "./fromTrip";
import { CATALOG_TERMS, PUB_LIMITS, catalogDoc, draftEntry, entryFromRest, fetchCatalog, fetchEntry, inputOf, tripPub, withInput } from "./publish";

const PLACES: Record<string, { lat: number; lon: number; cc: string }> = { Split: { lat: 43.51, lon: 16.44, cc: "HR" }, Dubrovnik: { lat: 42.65, lon: 18.09, cc: "HR" } };
const resolve = (n: string) => PLACES[n] || null;

function trip(): Trip {
  return {
    id: "t", name: "Kroatien mit Annabell", place: "Split", country: "Kroatien", from: "2027-06-05", to: "2027-06-10", tiers: {}, settings: DEFAULT_SETTINGS,
    travelers: [{ id: "a", name: "Annabell", household: "Kleinert", age: 40 }, { id: "b", name: "Bernd", household: "Kleinert", age: 42 }],
    items: [
      { id: "s1", cat: "stay", name: "Unterkunft", status: "booked", from: "2027-06-05", to: "2027-06-08", booking: { ref: "QX12345", provider: "Sonnenbucher" },
        options: [{ id: "s1o", label: "", price: { mode: "unit", currency: "EUR", unit: 300 }, loc: { lat: 43.5, lon: 16.4 }, source: { name: "Sonnenbucher", url: "https://sonnenbucher.example/x" },
          query: { place: "Split", checkin: "2027-06-05", checkout: "2027-06-08", adults: 2, childAges: [], rooms: 1 } }] },
      { id: "s2", cat: "stay", name: "Unterkunft", status: "idea", from: "2027-06-08", to: "2027-06-10",
        options: [{ id: "s2o", label: "", price: { mode: "unit", currency: "EUR", unit: 200 }, loc: { lat: 42.65, lon: 18.09 }, query: { place: "Dubrovnik", checkin: "2027-06-08", checkout: "2027-06-10", adults: 2, childAges: [], rooms: 1 } }] },
      { id: "r", cat: "transport", name: "Mietwagen", status: "idea", hint: "rental", options: [{ id: "ro", label: "", price: { mode: "unit", currency: "EUR", unit: 150 } }] }
    ]
  };
}
const base = () => tripToCatalog(trip(), { lang: "de", today: "2026-11-02", resolve });

describe("Veröffentlichen (#644)", () => {
  it("Angaben vorbelegt aus der Reise", () => {
    const i = inputOf(base());
    expect(i).toEqual({ title: "Kroatien mit", summary: "", kind: "road", months: [6] });
  });
  it("Eintrag: Titel und Beschreibung bereinigt (Namen, Anbieter, Buchungsnummer), Ersteller, Kennung, keine gelben ohne Anlass", () => {
    const d = draftEntry(trip(), base(), { title: "Kroatien mit Annabell", summary: "Gebucht bei Sonnenbucher (QX12345), Strand und Altstadt", kind: "round", months: [9, 6, 6, 13] }, { by: "reh42", id: "kat1" });
    expect(d.blocked).toBe(false);
    expect(d.entry).toMatchObject({ id: "kat1", source: "user", by: "reh42", title: "Kroatien mit", months: [6, 9] });
    expect(d.entry.summary).toBe("Gebucht bei (), Strand und Altstadt");
    const json = JSON.stringify(d.entry);
    for (const bad of ["Annabell", "Kleinert", "Sonnenbucher", "QX12345", "example"]) expect(json, bad).not.toContain(bad);
    // Namen fallen im Check auf (gelb, nur für den Ersteller), stehen aber nicht im Katalog
    expect(d.findings.map(f => f.code)).toContain("names");
    expect(d.entry.warn).toBeUndefined();
  });
  it("rot: Kontaktdaten und Links im eingetippten Text blockieren; leerer Titel auch", () => {
    const d = draftEntry(trip(), base(), { title: "Kroatien", summary: "Fragen an x@y.de", kind: "round", months: [6] }, { by: "reh42" });
    expect(d.blocked).toBe(true);
    expect(d.findings.find(f => f.level === "red")?.code).toBe("contact");
    expect(JSON.stringify(d.entry)).not.toContain("x@y.de");
    const e = draftEntry(trip(), base(), { title: "  ", summary: "", kind: "round", months: [] }, { by: "reh42" });
    expect(e.findings[0]).toEqual({ level: "red", code: "noTitle" });
    expect(e.entry.title).toBe("Split");
  });
  it("gelbe Hinweise kommen in den Eintrag, Reiseart lässt sich ändern", () => {
    const t = trip();
    t.to = "2027-06-12"; // zwei Nächte ohne Unterkunft
    const b = tripToCatalog(t, { lang: "de", today: "2026-11-02", resolve });
    const d = draftEntry(t, b, { ...inputOf(b), kind: "round" }, { by: "reh42" });
    expect(d.entry.warn).toEqual(["gap"]);
    expect(d.entry.kind).toBe("round");
    expect(withInput(b, { ...inputOf(b), kind: "quatsch" as never }).kind).toBe("road");
  });
  it("Länge begrenzt, Dokument mit Fassung der Bedingungen, zu groß ergibt null", () => {
    const d = draftEntry(trip(), base(), { title: "T".repeat(200), summary: "S".repeat(500), kind: "stay", months: [] }, { by: "reh42" });
    expect(d.entry.title).toHaveLength(PUB_LIMITS.title);
    expect(d.entry.summary).toHaveLength(PUB_LIMITS.summary);
    const doc = catalogDoc(d.entry)!;
    expect(doc).toMatchObject({ by: "reh42", terms: CATALOG_TERMS });
    expect(JSON.parse(doc.data).title).toBe(d.entry.title);
    expect(catalogDoc({ ...d.entry, days: [{ n: 1, notes: [{ text: "x".repeat(PUB_LIMITS.data) }] }] })).toBeNull();
  });
  it("Verweis in der Reise merkt sich die Angaben", () => {
    expect(tripPub("kat1", "anna", { title: " A ", summary: " B ", kind: "stay", months: [7, 7, 2] }, new Date("2026-11-02T10:00:00Z")))
      .toEqual({ id: "kat1", uid: "anna", at: "2026-11-02T10:00:00.000Z", input: { title: "A", summary: "B", kind: "stay", months: [2, 7] } });
  });
});

describe("Katalog lesen (REST)", () => {
  const e = draftEntry(trip(), base(), inputOf(base()), { by: "reh42", id: "x" }).entry;
  const doc = (id: string, data: string, by = "reh42") => ({ name: `projects/p/databases/(default)/documents/catalog/${id}`,
    fields: { uid: { stringValue: "anna" }, by: { stringValue: by }, data: { stringValue: data }, at: { timestampValue: "2026-11-02T10:00:00Z" } } });
  it("Kennung, Herkunft und Ersteller aus dem Dokument, nicht aus dem Text", () => {
    const r = entryFromRest(doc("kat9", JSON.stringify({ ...e, id: "anders", source: "idea", by: "admin" })))!;
    expect(r.entry).toMatchObject({ id: "kat9", source: "user", by: "reh42" });
    expect(r.uid).toBe("anna");
    expect(r.updated).toBe("2026-11-02T10:00:00Z");
  });
  it("kaputte Einträge fallen weg", () => {
    expect(entryFromRest(doc("a", "{kaputt"))).toBeNull();
    expect(entryFromRest(doc("b", JSON.stringify({ title: "x" })))).toBeNull();
    expect(entryFromRest(doc("c", JSON.stringify({ ...e, stand: "bald" })))).toBeNull();
    expect(entryFromRest({})).toBeNull();
  });
  it("Liste über mehrere Seiten; ohne Sammlung leer; einzelner Eintrag oder null", async () => {
    const pages = [{ documents: [doc("kat1", JSON.stringify(e))], nextPageToken: "n" }, { documents: [doc("b", JSON.stringify(e)), doc("c", "{")] }];
    let i = 0;
    const f = (async (url: string) => { expect(url).toContain("/catalog?pageSize=300"); if (i) expect(url).toContain("pageToken=n"); return new Response(JSON.stringify(pages[i++])); }) as typeof fetch;
    expect((await fetchCatalog(f)).map(x => x.entry.id)).toEqual(["kat1", "b"]);
    expect(await fetchCatalog((async () => new Response("{}")) as typeof fetch)).toEqual([]);
    const one = (async (url: string) => (url.endsWith("/catalog/kat1") ? new Response(JSON.stringify(doc("kat1", JSON.stringify(e)))) : new Response("", { status: 404 }))) as typeof fetch;
    expect((await fetchEntry("kat1", one))?.entry.id).toBe("kat1");
    expect(await fetchEntry("zz99", one)).toBeNull();
    expect(await fetchEntry("../x", one)).toBeNull();
  });
});
