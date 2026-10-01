import { describe, expect, it } from "vitest";
import fixture from "./kiwi.fixture.json";
import { fromKiwi, holdBags, kiwiArgs, searchKiwi } from "./kiwi";
import { atAirports, inWindow, merge, parseQuery, searchAll } from "./search";
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
  it("Koffer insgesamt: je Person verteilt (erst Erwachsene, dann Kinder, höchstens zwei je Person)", () => {
    expect(holdBags(2, 3, 3)).toEqual({ adults: [1, 1], children: [1, 0, 0] });
    expect(holdBags(2, 3, 0)).toEqual({ adults: [0, 0], children: [0, 0, 0] });
    expect(holdBags(2, 1, 4)).toEqual({ adults: [2, 1], children: [1] });
    expect(holdBags(1, 0, 9)).toEqual({ adults: [2], children: [] });
    const fam = { ...q, adults: 2, children: 3 };
    expect(kiwiArgs({ ...fam, bagCount: 3 })).toMatchObject({ adults_hold_bags: [1, 1], children_hold_bags: [1, 0, 0] });
    expect(kiwiArgs({ ...fam, bagCount: 0, bags: true })).not.toHaveProperty("adults_hold_bags");
    expect(kiwiArgs({ ...fam, bags: true })).toMatchObject({ adults_hold_bags: [1, 1], children_hold_bags: [1, 1, 1] });
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", adults: 2, children: 3, bagCount: 3 })).toMatchObject({ bagCount: 3 });
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", adults: 2, bagCount: 40 })).toBe("Koffer: 0 bis 18");
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
  it("Optionen: Umstiege, Self-Transfer, Koffer, ± Tage", () => {
    expect(kiwiArgs({ ...q, maxStops: 0, selfTransfer: false, bags: true, flexDays: 2 })).toMatchObject({
      max_sector_stopovers: 0, allow_self_transfer: false, adults_hold_bags: [1, 1], children_hold_bags: [1], departureDateFlexDays: 2, returnDateFlexDays: 2
    });
    const plain = kiwiArgs(q);
    expect(plain).not.toHaveProperty("max_sector_stopovers");
    expect(plain).not.toHaveProperty("adults_hold_bags");
    // flexibler Zeitraum: keine ± Tage
    expect(kiwiArgs({ ...q, latest: "2027-07-29", nightsMin: 7, flexDays: 2 })).not.toHaveProperty("departureDateFlexDays");
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", maxStops: 1, bags: true, selfTransfer: false, flexDays: 1 })).toMatchObject({ maxStops: 1, bags: true, selfTransfer: false, flexDays: 1 });
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", maxStops: 5 })).toBeTypeOf("string");
    expect(parseQuery({ from: "DUS", to: "SPU", depart: "2027-07-18", flexDays: 7 })).toBeTypeOf("string");
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

describe("Städte mit mehreren Flughäfen", () => {
  it("Kiwi bekommt mehrere Flughäfen als Liste, sonst das Kürzel", () => {
    expect(kiwiArgs({ ...q, to: "TYO", toAirports: ["HND", "NRT"], toCityCode: "TYO" }).flyTo).toBe("HND,NRT");
    expect(kiwiArgs({ ...q, to: "SPU", toAirports: ["SPU", "BWK", "DBV"] }).flyTo).toBe("SPU,BWK,DBV");
    expect(kiwiArgs({ ...q, to: "HND", toAirports: ["HND"] }).flyTo).toBe("HND");
    expect(kiwiArgs(q).flyFrom).toBe("DUS");
  });

  it("nur Treffer an den gewählten Flughäfen", () => {
    const o = (from: string, to: string) => ({ id: from + to, source: "x", sourceName: "x", price: 1, currency: "EUR", out: { from, to, dep: "2027-07-18T10:00", arr: "2027-07-18T12:00", minutes: 120, stops: 0, route: [from, to], carriers: [], flights: [from + to] } });
    const list = [o("DUS", "HND"), o("DUS", "NRT"), o("DUS", "KIX"), o("CGN", "HND")];
    expect(atAirports({ ...q, fromAirports: ["DUS"], toAirports: ["HND", "NRT"] }, list).map(x => x.id)).toEqual(["DUSHND", "DUSNRT"]);
    expect(atAirports(q, list)).toHaveLength(4);
  });

  it("prüft Flughafenlisten und Stadtnamen", () => {
    const b = { from: "DUS", to: "TYO", depart: "2027-07-18" };
    expect(parseQuery({ ...b, toAirports: ["HND", "NRT"], toCityCode: "TYO" })).toMatchObject({ toAirports: ["HND", "NRT"], toCityCode: "TYO" });
    expect(parseQuery({ ...b, toAirports: ["hnd"] })).toBe("Flughäfen: bis zu 8 Codes");
    expect(parseQuery({ ...b, toAirports: "HND" })).toBe("Flughäfen: bis zu 8 Codes");
    expect(parseQuery({ ...b, toCityCode: "Tokyo" })).toBe("Stadt-Code ungültig");
  });
});

describe("Nur Hinflug mit Zeitfenster", () => {
  it("Kiwi: Abflug zwischen zwei Tagen, ohne Rückflug", () => {
    const a = kiwiArgs({ ...q, ret: undefined, depart: "2027-03-01", departTo: "2027-03-10" });
    expect(a).toMatchObject({ departureDate: "01/03/2027", departureDateTo: "10/03/2027" });
    expect(a).not.toHaveProperty("returnDate");
  });
  it("prüft das Fenster", () => {
    const b = { from: "DUS", to: "GIG", depart: "2027-03-01" };
    expect(parseQuery({ ...b, departTo: "2027-03-10" })).toMatchObject({ departTo: "2027-03-10" });
    expect(parseQuery({ ...b, departTo: "2027-02-10" })).toBe("Zeitfenster endet vor dem Anfang");
    expect(parseQuery({ ...b, departTo: "2027-06-10" })).toBe("Zeitfenster höchstens 2 Monate");
    // mit Rückflug zählt das Fenster nicht
    expect(parseQuery({ ...b, ret: "2027-03-20", departTo: "2027-03-10" })).not.toHaveProperty("departTo");
  });
});

describe("Gabelflug mit langem Umstieg", () => {
  it("Kiwi: Umstiegsort und Stunden, mindestens ein Umstieg", () => {
    const a = kiwiArgs({ ...q, ret: undefined, to: "BKK", via: ["DOH"], viaHours: [10, 48], maxStops: 0 });
    expect(a).toMatchObject({ stopover_airports: "DOH", stopover_from: 10, stopover_to: 48, max_sector_stopovers: 1 });
  });
  it("Aufenthalt je Umstieg aus den Segmenten", () => {
    const seg = (from: string, to: string, dep: string, arr: string) => ({ from, to, departureTime: dep, arrivalTime: arr, flightNumber: "QR1", carrier: "QR" });
    const [o] = fromKiwi({ itineraries: [{ id: "x", price: 384, outbound: { from: "DUS", to: "BKK", departureTime: "2027-03-10T14:45:00", arrivalTime: "2027-03-12T06:40:00", durationSeconds: 1, route: ["DUS", "DOH", "BKK"],
      segments: [seg("DUS", "DOH", "2027-03-10T14:45:00", "2027-03-10T22:50:00"), seg("DOH", "BKK", "2027-03-11T20:15:00", "2027-03-12T06:40:00")] } }] });
    expect(o.out.layovers).toEqual([{ at: "DOH", hours: 21.4 }]);
  });
  it("prüft Umstieg", () => {
    const b = { from: "DUS", to: "BKK", depart: "2027-03-10" };
    expect(parseQuery({ ...b, via: ["DOH"], viaHours: [10, 48] })).toMatchObject({ via: ["DOH"], viaHours: [10, 48] });
    expect(parseQuery({ ...b, via: ["DOH"], viaHours: [48, 10] })).toBe("Umstieg: Stunden 1 bis 72, von ≤ bis");
    expect(parseQuery({ ...b, via: ["doh"], viaHours: [10, 48] })).toBe("Umstieg: bis zu 8 Codes");
  });

  it("Travelpayouts-Kennung (marker) nur mit eingeschalteten Partner-Links", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(String(u)); return new Response("{}", { status: 503 }); }) as unknown as typeof fetch;
    const q = parseQuery({ from: "DUS", to: "PMI", depart: "2027-05-10", ret: "2027-05-13" }) as FlightQuery;
    await searchAll(q, { TRAVELPAYOUTS_TOKEN: "t", TRAVELPAYOUTS_MARKER: "m1" }, f);
    expect(urls.filter(u => u.includes("travelpayouts")).every(u => !u.includes("marker="))).toBe(true);
    urls.length = 0;
    await searchAll(q, { TRAVELPAYOUTS_TOKEN: "t", TRAVELPAYOUTS_MARKER: "m1", PARTNER_LINKS: "on" }, f);
    expect(urls.some(u => u.includes("travelpayouts") && u.includes("marker=m1"))).toBe(true);
  });
});
