import { describe, expect, it } from "vitest";
import fixture from "./kiwi.fixture.json";
import { fromKiwi, kiwiArgs, searchKiwi } from "./kiwi";
import { inWindow, merge, parseQuery, searchAll } from "./search";
import type { FlightQuery } from "./types";

const q: FlightQuery = { from: "DUS", to: "SPU", depart: "2027-07-18", ret: "2027-07-29", adults: 2, children: 1, infants: 0 };

/** Kiwi-MCP nachgestellt: Session-Header, Antworten als Server-Sent Events */
function fakeKiwi(result: unknown, calls: { method: string; session?: string | null }[] = []): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ method: body.method, session: new Headers(init?.headers).get("mcp-session-id") });
    const sse = (o: unknown) => new Response(`event: message\ndata: ${JSON.stringify(o)}\n\n`, { headers: { "content-type": "text/event-stream", "mcp-session-id": "s1" } });
    if (body.method === "initialize") return sse({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: {} } });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return sse({ jsonrpc: "2.0", id: body.id, result });
  }) as typeof fetch;
}

describe("Flugsuche", () => {
  it("wandelt die Kiwi-Antwort in unser Format", () => {
    const [a, b, c] = fromKiwi(fixture);
    expect(a).toMatchObject({ source: "kiwi", price: 989, currency: "EUR", url: "https://kiwi.com/u/uqukjx" });
    expect(a.out).toMatchObject({ from: "DUS", to: "SPU", dep: "2027-07-18T06:10:00", minutes: 115, stops: 0, carriers: ["Eurowings"], flights: ["EW9958"] });
    expect(a.back?.flights).toEqual(["EW9959"]);
    expect(b.out.route).toEqual(["DUS", "VIE", "SPU"]);
    expect(c.out.carriers).toEqual(["Transavia", "Vueling"]);
    expect(a.baggage).toEqual({ personal: 3, cabin: 0, checked: 0 });
  });
  it("übersetzt die Anfrage in Kiwis Format", () => {
    expect(kiwiArgs(q)).toMatchObject({ flyFrom: "DUS", flyTo: "SPU", departureDate: "18/07/2027", returnDate: "29/07/2027", adults: 2, children: 1, infants: 0, currency: "EUR" });
    expect(kiwiArgs({ ...q, ret: undefined })).not.toHaveProperty("returnDate");
  });
  it("spricht MCP: initialize, initialized, tools/call mit Session", async () => {
    const calls: { method: string; session?: string | null }[] = [];
    const offers = await searchKiwi(q, fakeKiwi({ content: [{ type: "text", text: JSON.stringify(fixture) }] }, calls));
    expect(offers).toHaveLength(3);
    expect(calls.map(c => c.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    expect(calls[2].session).toBe("s1");
  });
  it("meldet Fehler von Kiwi", async () => {
    await expect(searchKiwi(q, fakeKiwi({ isError: true, content: [{ type: "text", text: "Ort unbekannt" }] }))).rejects.toThrow("Ort unbekannt");
  });
  it("führt Quellen zusammen: gleicher Flug nur einmal, der günstigste", () => {
    const k = fromKiwi(fixture);
    const other = [{ ...k[1], id: "x", source: "duffel", sourceName: "Duffel", price: 950 }];
    const m = merge([k, other]);
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ source: "duffel", price: 950 });
    expect(m.map(o => o.price)).toEqual([950, 989, 1026]);
  });
  it("sucht über alle eingerichteten Quellen und meldet den Stand je Quelle", async () => {
    const r = await searchAll(q, {}, fakeKiwi({ structuredContent: fixture }));
    expect(r.offers).toHaveLength(3);
    expect(r.sources.map(s => [s.id, s.configured, s.ok])).toEqual([["kiwi", true, true], ["duffel", false, false], ["travelpayouts", false, false]]);
    const down = await searchAll(q, {}, (async () => new Response("", { status: 503 })) as typeof fetch);
    expect(down.offers).toEqual([]);
    expect(down.sources[0]).toMatchObject({ id: "kiwi", ok: false, error: "Kiwi antwortet mit 503" });
  });
  it("flexibel: Abflug-Zeitraum bis späteste Rückkehr minus Mindest-Nächte, Nächte als Spanne", () => {
    const a = kiwiArgs({ ...q, ret: undefined, depart: "2027-07-15", latest: "2027-07-29", nightsMin: 7, nightsMax: 10 });
    expect(a).toMatchObject({ departureDate: "15/07/2027", departureDateTo: "22/07/2027", nights_in_dst_from: 7, nights_in_dst_to: 10 });
    expect(a).not.toHaveProperty("returnDate");
  });
  it("flexibel: Treffer nach der spätesten Rückkehr fallen raus", () => {
    const k = fromKiwi(fixture); // alle zurück am 29.07.
    expect(inWindow({ ...q, depart: "2027-07-15", latest: "2027-07-29", nightsMin: 7 }, k)).toHaveLength(3);
    expect(inWindow({ ...q, depart: "2027-07-15", latest: "2027-07-28", nightsMin: 7 }, k)).toHaveLength(0);
    expect(inWindow({ ...q, depart: "2027-07-19", latest: "2027-07-29", nightsMin: 7 }, k)).toHaveLength(0);
    expect(inWindow(q, k)).toHaveLength(3);
  });
  it("prüft flexible Anfragen", () => {
    const base = { from: "DUS", to: "SPU", depart: "2027-07-15", adults: 2 };
    expect(parseQuery({ ...base, latest: "2027-07-29", nightsMin: 7, nightsMax: 10, ret: "2027-07-20" })).toMatchObject({ latest: "2027-07-29", nightsMin: 7, nightsMax: 10, ret: undefined });
    expect(parseQuery({ ...base, latest: "2027-07-18", nightsMin: 7 })).toBeTypeOf("string");
    expect(parseQuery({ ...base, latest: "2027-07-29", nightsMin: 10, nightsMax: 7 })).toBeTypeOf("string");
    expect(parseQuery({ ...base, latest: "29.07.2027", nightsMin: 7 })).toBeTypeOf("string");
  });
  it("prüft Anfragen", () => {
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", adults: 2 })).toMatchObject({ adults: 2, children: 0, currency: "EUR" });
    expect(parseQuery({ from: "", to: "SPU", depart: "2027-07-18" })).toBeTypeOf("string");
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "18.07.2027" })).toBeTypeOf("string");
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", ret: "2027-07-01" })).toBeTypeOf("string");
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", adults: 1, infants: 2 })).toBeTypeOf("string");
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", adults: 12 })).toBeTypeOf("string");
  });
});
