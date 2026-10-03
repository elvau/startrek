import { describe, expect, it } from "vitest";
import { fromTicketmaster, searchTicketmaster, tmParams } from "./ticketmaster";
import { areaCc, localTime, matchTeams, searchFootballData } from "./footballdata";
import { mergeEvents, parseEventQuery, searchEvents } from "./search";

const TM = { _embedded: { events: [
  { id: "G1", name: "Coldplay", url: "https://tm/1", dates: { start: { localDate: "2027-06-12", localTime: "19:30:00" } },
    classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
    _embedded: { venues: [{ name: "Wembley Stadium", city: { name: "London" }, country: { countryCode: "GB" }, location: { latitude: "51.556", longitude: "-0.2796" } }] } },
  { id: "G2", name: "Ohne Datum", dates: { start: {} } }
] } };

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

const TEAMS: Record<string, unknown> = {
  PL: { teams: [{ id: 57, name: "Arsenal FC", shortName: "Arsenal", tla: "ARS", venue: "Emirates Stadium", address: "75 Drayton Park London N5 1BU" }, { id: 61, name: "Chelsea FC", shortName: "Chelsea", tla: "CHE", venue: "Stamford Bridge" }] },
  BL1: { teams: [{ id: 5, name: "FC Bayern München", shortName: "Bayern", tla: "FCB", venue: "Allianz Arena", address: "Säbener Str. 51 München 81547" }] }
};
const MATCHES: Record<number, unknown> = {
  57: { matches: [
    { id: 1, utcDate: "2027-05-15T19:00:00Z", homeTeam: { id: 57, shortName: "Arsenal" }, awayTeam: { id: 5, shortName: "Bayern" }, competition: { name: "UEFA Champions League" } },
    { id: 2, utcDate: "2027-05-08T14:00:00Z", homeTeam: { id: 61, shortName: "Chelsea" }, awayTeam: { id: 57, shortName: "Arsenal" }, competition: { name: "Premier League" } }
  ] },
  5: { matches: [{ id: 1, utcDate: "2027-05-15T19:00:00Z", homeTeam: { id: 57, shortName: "Arsenal" }, awayTeam: { id: 5, shortName: "Bayern" }, competition: { name: "UEFA Champions League" } }] }
};
function fdFetch(log: string[]) {
  return (async (url: string, init?: RequestInit) => {
    log.push(url);
    if ((init?.headers as Record<string, string>)["X-Auth-Token"] !== "k") return json({}, 403);
    const comp = /competitions\/(\w+)\/teams/.exec(url)?.[1];
    if (comp) return json(TEAMS[comp] || { teams: [] });
    const team = Number(/teams\/(\d+)\/matches/.exec(url)?.[1]);
    return json(MATCHES[team] || { matches: [] });
  }) as unknown as typeof fetch;
}

describe("Event-Suche", () => {
  it("Ticketmaster: Anfrage und Treffer mit Ort und Koordinaten", async () => {
    const p = tmParams({ q: "Coldplay", to: "2027-12-31" }, "KEY", "2027-01-01");
    expect(Object.fromEntries(p)).toMatchObject({ apikey: "KEY", keyword: "Coldplay", startDateTime: "2027-01-01T00:00:00Z", endDateTime: "2027-12-31T23:59:59Z" });
    expect(fromTicketmaster(TM)).toEqual([{ id: "tm:G1", source: "ticketmaster", sourceName: "Ticketmaster", name: "Coldplay", start: "2027-06-12T19:30", venue: "Wembley Stadium", city: "London", cc: "GB", lat: 51.556, lon: -0.2796, url: "https://tm/1", category: "Rock" }]);
    const f = (async () => json({}, 401)) as unknown as typeof fetch;
    await expect(searchTicketmaster({ q: "x" }, "bad", f)).rejects.toThrow(/401/);
  });

  it("football-data: Ortszeit, Mannschaften finden", () => {
    expect(localTime("2027-05-15T19:00:00Z", "GB")).toBe("2027-05-15T20:00");
    expect(localTime("2027-01-15T19:00:00Z", "DE")).toBe("2027-01-15T20:00");
    // Champions League: Baku (Sabah FK) in Ortszeit, nicht Pariser Zeit
    expect(localTime("2026-10-20T16:45:00Z", "AZ")).toBe("2026-10-20T20:45");
    const teams = [{ id: 57, name: "Arsenal FC", shortName: "Arsenal" }, { id: 4, name: "Bayer 04 Leverkusen", shortName: "Leverkusen" }, { id: 5, name: "FC Bayern München", shortName: "Bayern" }];
    expect(matchTeams(teams, "arsenal").map(t => t.id)).toEqual([57]);
    expect(matchTeams(teams, "Arsenal gegen Bayern").map(t => t.id)).toEqual([57, 5]);
    // Land aus dem Gebiet der Mannschaft (nur Champions League, keine Liga mit Land)
    expect(areaCc({ name: "Azerbaijan", code: "AZE" })).toBe("AZ");
    expect(areaCc({ name: "England", code: "ENG" })).toBe("GB");
    expect(areaCc({ name: "Europe", code: "EUR" })).toBeUndefined();
  });

  it("football-data: nächste Spiele mit Stadion der Heimmannschaft; zwei Mannschaften: ihr gemeinsames Spiel", async () => {
    const log: string[] = [];
    const one = await searchFootballData({ q: "Arsenal" }, "k", fdFetch(log));
    expect(one.map(e => [e.name, e.start, e.venue, e.cc])).toEqual([
      ["Chelsea – Arsenal", "2027-05-08T15:00", "Stamford Bridge", "GB"],
      ["Arsenal – Bayern", "2027-05-15T20:00", "Emirates Stadium", "GB"]
    ]);
    expect(one[1]).toMatchObject({ address: "75 Drayton Park London N5 1BU", category: "UEFA Champions League" });
    const both = await searchFootballData({ q: "Arsenal Bayern" }, "k", fdFetch([]));
    expect(both.map(e => e.name)).toEqual(["Arsenal – Bayern"]);
    // Mannschaftsliste kommt aus dem Zwischenspeicher
    const store = new Map<string, unknown>();
    const cached = async <T,>(k: string, _t: number, load: () => Promise<T>) => (store.has(k) ? (store.get(k) as T) : (store.set(k, await load()), store.get(k) as T));
    const log2: string[] = [];
    await searchFootballData({ q: "Arsenal" }, "k", fdFetch(log2), cached);
    await searchFootballData({ q: "Chelsea" }, "k", fdFetch(log2), cached);
    expect(log2.filter(u => u.includes("/competitions/")).length).toBe(6);
  });

  it("zusammenführen, Quellen ohne Schlüssel bleiben aus, Anfrage prüfen", async () => {
    const a = { id: "fd:1", source: "footballdata", sourceName: "fd", name: "Arsenal – Bayern", start: "2027-05-15T20:00", venue: "Emirates Stadium" };
    const b = { id: "tm:9", source: "ticketmaster", sourceName: "tm", name: "Arsenal v Bayern", start: "2027-05-15T20:00", city: "London", lat: 51.5, lon: -0.1 };
    const m = mergeEvents([[a], [b]]);
    expect(m).toHaveLength(1);
    // dieselbe ID zweimal (anderer Name oder Tag): nur einmal, sonst bricht die Liste in der App ab
    const twice = mergeEvents([[b, { ...b, name: "VIP: Arsenal v Bayern", start: "2027-05-16T20:00" }]]);
    expect(twice.map(e => e.id)).toEqual(["tm:9"]);
    expect(m[0]).toMatchObject({ id: "fd:1", venue: "Emirates Stadium", city: "London", lat: 51.5 });
    const res = await searchEvents({ q: "Arsenal" }, {});
    expect(res.events).toEqual([]);
    expect(res.sources.map(s => [s.id, s.configured])).toEqual([["ticketmaster", false], ["footballdata", false], ["sports", true]]);
    expect(parseEventQuery({ q: "x" })).toMatch(/Suchbegriff/);
    expect(parseEventQuery({ q: "Arsenal", from: "2027-05-01", to: "2027-04-01" })).toMatch(/endet/);
    expect(parseEventQuery({ q: " Arsenal ", from: "2027-05-01" })).toEqual({ q: "Arsenal", from: "2027-05-01" });
  });
});
