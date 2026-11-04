import { describe, expect, it } from "vitest";
import { bookingArgs, bookingSoldOut, fromTrivago } from "./providers";
import { parseStayQuery, searchStays } from "./search";
import type { StayQuery } from "./types";

/* Familienhotels gezielt (#683): Suche nach Namen, ausgebucht sichtbar, Pool laut Filter */
const Q = { place: "Schönberg", country: "Germany", checkin: "2027-11-13", checkout: "2027-11-15", adults: 2, childAges: [8, 5], rooms: 1, type: "hotel", currency: "EUR" } as StayQuery;
const trivagoHit = (id: string, name: string, deals: object[], amen = "Wellness, Parkplätze") =>
  ({ accommodation_id: id, accommodation_name: name, hotel_rating: 4, country_city: "Schönberg Niederbayern, Deutschland", top_amenities: amen, latitude: 48.83, longitude: 13.35, deals });
const deal = (stay: string) => ({ advertiser: "Hotelwebseite", price_per_stay: stay, currency: "EUR", deal_url: "https://www.trivago.de/x", price_attributes: [] });

/** MCP-Server nachgestellt: Antwort je Werkzeug und Argumenten; zählt Verbindungen */
function mcp(answer: (tool: string, args: any) => object | { error: string }) {
  const calls: { url: string; tool: string; args: any }[] = [];
  let inits = 0;
  const f = (async (url: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    if (b.method === "initialize") inits++;
    const json = (x: object) => new Response(JSON.stringify({ jsonrpc: "2.0", id: b.id, ...x }), { headers: { "content-type": "application/json" } });
    if (b.method !== "tools/call") return json({ result: {} });
    calls.push({ url, tool: b.params.name, args: b.params.arguments });
    const a = answer(b.params.name, b.params.arguments);
    return "error" in a ? json({ result: { isError: true, content: [{ type: "text", text: (a as { error: string }).error }] } }) : json({ result: { structuredContent: a } });
  }) as typeof fetch;
  return { f, calls, inits: () => inits };
}

describe("Familienhotels gezielt (#683)", () => {
  it("Anfrage: bis 5 Namen, Umkreis gilt dann nicht", () => {
    expect(parseStayQuery({ ...Q, names: [" Familotel Schreinerhof ", "Landhaus zur Ohe"] })).toMatchObject({ names: ["Familotel Schreinerhof", "Landhaus zur Ohe"] });
    expect(parseStayQuery({ ...Q, names: ["a", "b", "c", "d", "e", "f"] })).toBe("Namen: bis zu 5, je 2 bis 80 Zeichen");
    expect(parseStayQuery({ ...Q, names: ["Ulrichshof"], lat: 48.8, lon: 13.3, radiusKm: 10 })).not.toHaveProperty("radiusKm");
  });
  it("Booking.com: hotel_names mit Ort, ohne Art und Koordinaten; ausgebucht aus dem Fehler", () => {
    const a = bookingArgs({ ...Q, type: "whole", names: ["Ulrichshof"], lat: 48.8, lon: 13.3, radiusKm: 10 });
    expect(a).toMatchObject({ hotel_names: ["Ulrichshof"], destination: "Schönberg, Germany" });
    expect(a).not.toHaveProperty("coordinates");
    expect(a).not.toHaveProperty("accommodation_types");
    const err = new Error(JSON.stringify({ type: "hotel_names_no_availability", details: ["Landhaus zur Ohe", "Ulrichshof"] }));
    expect(bookingSoldOut(err).map(o => [o.name, o.soldOut])).toEqual([["Landhaus zur Ohe", true], ["Ulrichshof", true]]);
    expect(() => bookingSoldOut(new Error("Booking.com antwortet mit 500"))).toThrow("500");
  });
  it("Trivago: Haus ohne Angebot gilt als ausgebucht, die Art filtert bei Namen nicht", () => {
    const l = fromTrivago({ accommodations: [trivagoHit("1", "Familienhotel Schreinerhof", [deal("1.643€")]), trivagoHit("2", "Landhaus zur Ohe GmbH", [])] }, { type: "whole", names: ["x"] });
    expect(l.map(o => [o.name, o.total, !!o.soldOut])).toEqual([["Familienhotel Schreinerhof", 1643, false], ["Landhaus zur Ohe GmbH", 0, true]]);
    // ohne Namen: Hotel fällt bei „ganze Unterkunft“ weiter weg
    expect(fromTrivago({ accommodations: [trivagoHit("1", "Familienhotel Schreinerhof", [deal("1.643€")])] }, { type: "whole" })).toEqual([]);
  });
  it("Suche: je Name eine Trivago-Suche in einer Verbindung, ausgebucht getrennt gemeldet", async () => {
    const { f, calls, inits } = mcp((tool, a) => {
      if (tool === "accommodations_search") return { error: JSON.stringify({ type: "hotel_names_no_availability", details: ["Landhaus zur Ohe", "Familienhotel Schreinerhof"] }) };
      return { accommodations: a.query === "Familotel Schreinerhof" ? [trivagoHit("1", "Familienhotel Schreinerhof", [deal("1.643€")])] : a.query === "Landhaus zur Ohe" ? [trivagoHit("2", "Landhaus zur Ohe", [])] : [] };
    });
    const r = await searchStays({ ...Q, names: ["Familotel Schreinerhof", "Landhaus zur Ohe", "Ulrichshof"] }, { BOOKING_MCP_URL: "https://b", TRIVAGO_MCP_URL: "https://t" }, f);
    expect(calls.filter(c => c.tool === "trivago-accommodation-search").map(c => c.args.query)).toEqual(["Familotel Schreinerhof", "Landhaus zur Ohe", "Ulrichshof"]);
    expect(calls.find(c => c.tool === "accommodations_search")?.args.hotel_names).toHaveLength(3);
    expect(inits()).toBe(2);
    expect(r.offers.map(o => o.name)).toEqual(["Familienhotel Schreinerhof"]);
    // bei Trivago frei, bei Booking ausgebucht: gilt nicht als ausgebucht
    expect(r.soldOut).toEqual(["Landhaus zur Ohe"]);
    expect(r.sources.find(s => s.id === "booking")).toMatchObject({ ok: true, count: 0 });
  });
  it("mit Pool-Filter gesucht: Treffer tragen „Pool“, auch wenn Trivago nur „Wellness“ nennt", async () => {
    const { f } = mcp(() => ({ accommodations: [trivagoHit("1", "BERGlässig Hotel Bodenmais", [deal("855€")])] }));
    const r = await searchStays({ ...Q, must: ["pool"], sources: ["trivago"] }, { TRIVAGO_MCP_URL: "https://t" }, f);
    expect(r.offers[0].facts?.[0]).toBe("Pool");
    const r2 = await searchStays({ ...Q, sources: ["trivago"] }, { TRIVAGO_MCP_URL: "https://t" }, f);
    expect(r2.offers[0].facts).not.toContain("Pool");
  });
});
