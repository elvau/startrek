import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncTips } from "../fees";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import { cruiseKey, cruisePayload, cruisesFromAi, parseCruiseQuery, type CruiseQuery } from "./search";
import { hitItem } from "./app";
import { partnerLink, partnersOf } from "../partners";

beforeAll(() => syncTips(false));
afterAll(() => syncTips(true));

const Q: CruiseQuery = { area: "med", from: "2027-05-01", to: "2027-05-31", adults: 2, lang: "de" };
const res = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("Kreuzfahrt-Suche: Anfrage (#519)", () => {
  it("Zeitraum Pflicht, Grenzen, unbekanntes fällt weg", () => {
    expect(parseCruiseQuery({})).toBe("Zeitraum fehlt");
    expect(parseCruiseQuery({ from: "2027-05-10", to: "2027-05-01" })).toBe("Zeitraum ungültig");
    expect(parseCruiseQuery({ from: "2027-01-01", to: "2028-06-01" })).toBe("Zeitraum zu lang");
    expect(parseCruiseQuery({ from: "2027-05-01", to: "2027-05-31", area: "mars", adults: 99, nightsMin: 7, nightsMax: 3, cabin: "balcony", port: " Kiel ", childAges: [5, 40], lang: "xx", email: "a@b.c" }))
      .toEqual({ area: "any", from: "2027-05-01", to: "2027-05-31", adults: 2, lang: "de", port: "Kiel", nightsMin: 7, childAges: [5], cabin: "balcony" });
  });
  it("Anfrage an die KI: Websuche, Zeitraum, Personen; Schlüssel ohne Personenzahl", () => {
    const p = cruisePayload({ ...Q, port: "Barcelona", childAges: [8] }, "2026-10-22");
    expect(p.tools).toEqual([{ google_search: {} }]);
    const txt = p.contents[0].parts[0].text;
    expect(txt).toContain("Mediterranean");
    expect(txt).toContain("Embarkation port: Barcelona");
    expect(txt).toContain("between 2027-05-01 and 2027-05-31");
    expect(txt).toContain("2 adults and 1 children (ages 8)");
    expect(cruiseKey({ ...Q, adults: 4 })).toBe(cruiseKey(Q));
  });
});

describe("Kreuzfahrt-Suche: Treffer prüfen (#519)", () => {
  it("nur mit Link, Schiff oder Reederei und Abfahrt im Zeitraum; günstigste zuerst; doppelte einmal", () => {
    const hits = cruisesFromAi(res("Hier:\n```json\n" + JSON.stringify({ cruises: [
      { line: "Reederei A", ship: "Schiff A", from: "2027-05-10", to: "2027-05-17", ports: [{ place: "Barcelona", date: "2027-05-10" }, { sea: true }, { place: "Rom" }, { place: "Barcelona", date: "2027-05-17" }], price: { perPerson: 899.4, currency: "eur", cabin: "balcony" }, url: "https://portal.example/a", source: "Portal" },
      { line: "Reederei B", from: "2027-05-03", price: { perPerson: 499 }, url: "https://www.b.example/x" },
      { ship: "Schiff A", from: "2027-05-10", url: "https://portal.example/a2" },
      { ship: "zu spät", from: "2027-06-10", url: "https://x.example" },
      { ship: "ohne Link", from: "2027-05-10", url: "javascript:alert(1)" },
      { from: "2027-05-10", url: "https://x.example" }
    ] }) + "\n```"), Q);
    expect(hits.map(h => h.line || h.ship)).toEqual(["Reederei B", "Reederei A"]);
    expect(hits[0]).toMatchObject({ source: "b.example", price: { perPerson: 499, currency: "EUR" } });
    expect(hits[1]).toMatchObject({ nights: 7, price: { perPerson: 899, currency: "EUR", cabin: "balcony" }, source: "Portal" });
    expect(hits[1].ports.map(p => p.sea ? "~" : p.place)).toEqual(["Barcelona", "~", "Rom", "Barcelona"]);
    expect(cruisesFromAi(res("kein JSON"), Q)).toEqual([]);
    expect(cruisesFromAi({}, Q)).toEqual([]);
  });
  it("Treffer übernehmen: Route, Kabinen nach Familien mit Preis pro Person, Link, bitte prüfen", () => {
    const trip: Trip = { id: "t", name: "R", place: "", country: "", items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS },
      travelers: [{ id: "a", name: "A", household: "X" }, { id: "b", name: "B", household: "X" }, { id: "c", name: "C", household: "Y" }] };
    const [h] = cruisesFromAi(res(JSON.stringify({ cruises: [{ line: "L", ship: "S", from: "2027-05-10", to: "2027-05-17", price: { perPerson: 700, cabin: "outside" }, url: "https://p.example/s", source: "P" }] })), Q);
    const it = hitItem(trip, h, "2026-10-22T10:00:00Z");
    expect(it).toMatchObject({ name: "S", check: true, ai: { kind: "suggested" }, from: "2027-05-10", to: "2027-05-17", cruise: { line: "L", ship: "S" } });
    expect(it.options[0].source).toMatchObject({ name: "P", url: "https://p.example/s", imported: true });
    expect(it.options[0].cabins!.map(c => [c.type, c.price, c.per, c.who.length])).toEqual([["outside", 700, "person", 2], ["outside", 700, "person", 1]]);
    expect(it.options[0].price.unit).toBe(2100);
  });
  it("Portale zum Vergleichen: neutral, solange keine Kennung hinterlegt ist", () => {
    expect(partnersOf("cruise").length).toBeGreaterThanOrEqual(3);
    for (const id of partnersOf("cruise")) expect(partnerLink(id, undefined as never, true)?.sponsored).toBe(false);
  });
});
