import { describe, expect, it } from "vitest";
import { fromTicketmaster, tmParams } from "./ticketmaster";
import { searchFootballData, teamsInCity, type FdTeam } from "./footballdata";
import { inCity, parseEventQuery, searchEvents } from "./search";

const teams: FdTeam[] = [
  { id: 57, name: "Arsenal FC", address: "75 Drayton Park London N5 1BU", venue: "Emirates Stadium", cc: "GB" },
  { id: 61, name: "Chelsea FC", address: "Fulham Road London SW6 1HS", venue: "Stamford Bridge", cc: "GB" },
  { id: 5, name: "FC Bayern München", address: "Säbener Str. 51-57 München 81547", venue: "Allianz Arena", cc: "DE" },
  { id: 9, name: "Londonderry Town", address: "Derry", cc: "GB" }
];

describe("Events vor Ort", () => {
  it("Anfrage: mit Stadt darf das Suchwort fehlen, Mitte und englischer Name gehen mit", () => {
    expect(parseEventQuery({ q: "", city: "Mailand", cityEn: "Milan", cc: "IT", lat: 45.46, lon: 9.19, from: "2027-05-01", to: "2027-05-05" }))
      .toEqual({ q: "", city: "Mailand", cityEn: "Milan", cc: "IT", lat: 45.46, lon: 9.19, from: "2027-05-01", to: "2027-05-05" });
    expect(parseEventQuery({ q: "" })).toMatch(/Suchbegriff/);
    expect(parseEventQuery({ q: "x", city: "Rom" })).toMatch(/Suchbegriff/);
    expect(parseEventQuery({ city: "Rom", lat: 999, lon: 1 })).toEqual({ q: "", city: "Rom" });
  });

  it("Ticketmaster: Umkreis um die Stadtmitte, sonst Stadtname; Preise ab", () => {
    const p = tmParams({ q: "", city: "Mailand", cityEn: "Milan", cc: "IT", lat: 45.46, lon: 9.19, from: "2027-05-01", to: "2027-05-05" }, "K", "2027-01-01");
    expect([p.get("latlong"), p.get("radius"), p.get("unit"), p.get("countryCode"), p.get("keyword"), p.get("city")]).toEqual(["45.46,9.19", "30", "km", "IT", null, null]);
    expect(p.get("startDateTime")).toBe("2027-05-01T00:00:00Z");
    expect(tmParams({ q: "", city: "Mailand", cityEn: "Milan" }, "K", "2027-01-01").get("city")).toBe("Milan");
    const [e] = fromTicketmaster({ _embedded: { events: [{ id: "A", name: "Konzert", dates: { start: { localDate: "2027-05-02" } }, priceRanges: [{ type: "standard", currency: "EUR", min: 45.5, max: 120 }] }] } });
    expect(e.price).toEqual({ min: 45.5, max: 120, currency: "EUR" });
  });

  it("football-data: Vereine der Stadt (nicht Londonderry), nur Heimspiele im Zeitraum", async () => {
    expect(teamsInCity(teams, "London", "GB").map(t => t.id)).toEqual([57, 61]);
    expect(teamsInCity(teams, "München").map(t => t.id)).toEqual([5]);
    const asked: string[] = [];
    const f = (async (url: string) => {
      asked.push(url);
      if (url.includes("/competitions/")) return new Response(JSON.stringify({ teams: url.includes("/PL/") ? [{ id: 57, name: "Arsenal FC", address: "75 Drayton Park London N5 1BU", venue: "Emirates Stadium" }, { id: 61, name: "Chelsea FC", address: "Fulham Road London SW6 1HS" }] : [] }));
      const home = url.includes("/teams/57/");
      return new Response(JSON.stringify({ matches: [
        { id: home ? 1 : 2, utcDate: "2027-05-02T14:00:00Z", homeTeam: { id: home ? 57 : 61, shortName: home ? "Arsenal" : "Chelsea" }, awayTeam: { id: 1, shortName: "Everton" }, competition: { name: "Premier League" } },
        { id: 3, utcDate: "2027-05-03T14:00:00Z", homeTeam: { id: 99, shortName: "Spurs" }, awayTeam: { id: home ? 57 : 61, shortName: "X" } }
      ] }));
    }) as unknown as typeof fetch;
    const hits = await searchFootballData({ q: "", city: "London", cc: "GB", from: "2027-05-01", to: "2027-05-05" }, "k", f);
    expect(hits.map(h => h.name)).toEqual(["Arsenal – Everton", "Chelsea – Everton"]);
    expect(asked.filter(u => u.includes("/teams/")).every(u => u.includes("venue=HOME") && u.includes("dateFrom=2027-05-01") && u.includes("dateTo=2027-05-05"))).toBe(true);
  });

  it("nur Treffer am Reiseort: Umkreis, Stadtname oder Anschrift", async () => {
    const q = { q: "", city: "Mailand", cityEn: "Milan", lat: 45.46, lon: 9.19 };
    expect(inCity({ id: "a", source: "", sourceName: "", name: "", start: "", lat: 45.5, lon: 9.2 }, q)).toBe(true);
    expect(inCity({ id: "b", source: "", sourceName: "", name: "", start: "", lat: 41.9, lon: 12.5 }, q)).toBe(false);
    expect(inCity({ id: "c", source: "", sourceName: "", name: "", start: "", city: "Milan" }, { q: "", city: "Mailand", cityEn: "Milan" })).toBe(true);
    expect(inCity({ id: "d", source: "", sourceName: "", name: "", start: "", address: "Via Roma 1 Torino" }, { q: "", city: "Mailand", cityEn: "Milan" })).toBe(false);
    const res = await searchEvents({ q: "", city: "Rom" }, {});
    // ohne Schlüssel bleibt nur der Sportkalender
    expect(res.sources.filter(s => s.configured).map(s => s.id)).toEqual(["sports"]);
  });
});
