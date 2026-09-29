import { describe, expect, it } from "vitest";
import trivago from "./trivago.fixture.json";
import booking from "./booking.fixture.json";
import { boardOf, bookingArgs, fromBooking, fromTrivago, priceNum, searchTrivago, trivagoArgs } from "./providers";
import { mergeStays, parseStayQuery, searchStays } from "./search";
import { defaultStayQuery, guests, stayToOption, takeStay } from "./app";
import type { StayOffer, StayQuery } from "./types";
import type { Item, Trip } from "../model";

const q: StayQuery = { place: "Split", country: "Kroatien", checkin: "2027-07-18", checkout: "2027-07-25", adults: 2, childAges: [8], rooms: 1, type: "all", currency: "EUR" };

/** MCP-Server nachgestellt: Session-Header, Antworten als Server-Sent Events */
function fakeMcp(result: unknown, calls: { method: string; tool?: string; args?: unknown }[] = []): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ method: body.method, tool: body.params?.name, args: body.params?.arguments });
    const sse = (o: unknown) => new Response(`event: message\ndata: ${JSON.stringify(o)}\n\n`, { headers: { "content-type": "text/event-stream", "mcp-session-id": "s1" } });
    if (body.method === "initialize") return sse({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: {} } });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return sse({ jsonrpc: "2.0", id: body.id, result });
  }) as typeof fetch;
}

describe("Unterkunftssuche: Anbieter", () => {
  it("liest Preise in beiden Schreibweisen", () => {
    expect(priceNum("2.575€")).toBe(2575);
    expect(priceNum("1,889")).toBe(1889);
    expect(priceNum("725,05 €")).toBe(725.05);
    expect(priceNum(840)).toBe(840);
    expect(priceNum("")).toBeNaN();
  });
  it("wandelt die Trivago-Antwort in unser Format, ohne Einträge ohne Preis", () => {
    const l = fromTrivago(trivago);
    expect(l).toHaveLength(4);
    expect(l[0]).toMatchObject({ id: "trivago:4a9a596c684b", source: "trivago", via: "Airbnb", name: "Nennolina", total: 2575, score: 9.5, reviews: 13, place: "Split, 0.7 km bis Zentrum" });
    expect(l[0].facts).toEqual(["Küche", "Parkplatz", "Klimaanlage", "Waschmaschine"]);
    expect(l[1]).toMatchObject({ name: "Central Square Heritage Hotel", total: 1476, stars: 4, reviews: 1889, via: "CHECK24" });
    expect(l[0].stars).toBeUndefined();
  });
  it("Trivago: Art der Unterkunft (mit Küche = ganze Unterkunft, mit Sternen = Hotel)", () => {
    expect(fromTrivago(trivago, { type: "whole" }).map(o => o.name)).toEqual(["Nennolina", "Ferienwohnung Klara"]);
    expect(fromTrivago(trivago, { type: "hotel" }).map(o => o.name)).toEqual(["Central Square Heritage Hotel", "Cornaro Hotel"]);
  });
  it("wandelt die Booking.com-Antwort in unser Format", () => {
    const l = fromBooking(booking);
    expect(l).toHaveLength(4);
    expect(l[0]).toMatchObject({ id: "booking:1424134", sourceName: "Booking.com", name: "Antea", total: 840, score: 9.5, reviews: 217, stars: 3, place: "Split Stadtzentrum, Split", lat: 43.50983 });
    expect(l[0].facts).toEqual(["Klimaanlage"]);
    expect(l[3].total).toBe(725.05);
  });
  it("baut die Anfragen für beide Anbieter", () => {
    expect(bookingArgs({ ...q, type: "whole" })).toMatchObject({ destination: "Split, Kroatien", checkin_date: "2027-07-18", number_of_adults: 2, children_ages: [8], number_of_rooms: 1, accommodation_types: ["HOLIDAY_HOME", "APARTMENT", "VILLA"], currency: "EUR" });
    expect(bookingArgs({ ...q, childAges: [] })).not.toHaveProperty("children_ages");
    expect(trivagoArgs({ ...q, childAges: [8, 3], rooms: 3 })).toMatchObject({ query: "Split", arrival: "2027-07-18", departure: "2027-07-25", adults: 2, children: 2, children_ages: "8-3", rooms: 2, currency: "EUR" });
  });
  it("fragt Trivago über MCP (initialize, initialized, tools/call)", async () => {
    const calls: { method: string; tool?: string }[] = [];
    const l = await searchTrivago(q, "https://t.test/mcp", fakeMcp({ content: [{ type: "text", text: JSON.stringify(trivago) }, { type: "image", data: "…" }] }, calls));
    expect(calls.map(c => c.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    expect(calls[2].tool).toBe("trivago-accommodation-search");
    expect(l).toHaveLength(4);
  });
});

describe("Unterkunftssuche: zusammenführen", () => {
  const o = (id: string, name: string, total: number, lat?: number): StayOffer => ({ id, source: id.split(":")[0], sourceName: id, name, total, currency: "EUR", lat, lon: lat });
  it("gleiche Unterkunft aus zwei Quellen: nur die günstigere bleibt, sortiert nach Preis", () => {
    const m = mergeStays([[o("booking:1", "Hotel Marul", 2400, 43.51), o("booking:2", "Antea", 840)], [o("trivago:a", "Hotel Marul", 2300, 43.511), o("trivago:b", "Klara", 783)]]);
    expect(m.map(x => x.id)).toEqual(["trivago:b", "booking:2", "trivago:a"]);
  });
  it("gleicher Name, aber weit auseinander: beide bleiben", () => {
    expect(mergeStays([[o("booking:1", "Villa Sol", 900, 43.5)], [o("trivago:a", "Villa Sol", 800, 43.7)]])).toHaveLength(2);
  });
  it("Booking.com erst mit Adresse; fragt nur gewählte Quellen", async () => {
    const r = await searchStays(q, {}, fakeMcp({ structuredContent: trivago }));
    expect(r.sources.map(s => [s.id, s.configured, s.ok, s.count])).toEqual([["booking", false, false, 0], ["trivago", true, true, 4]]);
    const calls: { method: string; tool?: string }[] = [];
    const both = await searchStays(q, { BOOKING_MCP_URL: "https://b.test/mcp" }, (async (u: RequestInfo | URL, i?: RequestInit) =>
      fakeMcp({ structuredContent: String(u).startsWith("https://b.test") ? booking : trivago }, calls)(u, i)) as typeof fetch);
    expect(both.offers).toHaveLength(8);
    expect(both.offers[0]).toMatchObject({ name: "Rooms Šećer", total: 720 });
    const only = await searchStays({ ...q, sources: ["trivago"] }, { BOOKING_MCP_URL: "https://b.test/mcp" }, fakeMcp({ structuredContent: trivago }));
    expect(only.sources.map(s => s.id)).toEqual(["trivago"]);
  });
  it("Quelle nicht erreichbar: Fehler je Quelle, keine Ausnahme", async () => {
    const r = await searchStays(q, {}, (async () => new Response("", { status: 503 })) as typeof fetch);
    expect(r.offers).toEqual([]);
    expect(r.sources[1]).toMatchObject({ id: "trivago", ok: false, error: "Trivago antwortet mit 503" });
  });
});

describe("Unterkunftssuche: Anfrage prüfen", () => {
  it("nimmt eine gültige Anfrage an", () => {
    expect(parseStayQuery({ ...q, sources: ["trivago"] })).toEqual({ ...q, sources: ["trivago"] });
    expect(parseStayQuery({ place: "Split", checkin: "2027-07-18", checkout: "2027-07-20" })).toMatchObject({ adults: 1, childAges: [], rooms: 1, type: "all", currency: "EUR" });
  });
  it("lehnt Unsinn ab", () => {
    expect(parseStayQuery({ ...q, place: "" })).toBe("Ort angeben");
    expect(parseStayQuery({ ...q, checkout: "2027-07-18" })).toMatch(/nach der Anreise/);
    expect(parseStayQuery({ ...q, checkout: "2027-12-31" })).toMatch(/90 Nächte/);
    expect(parseStayQuery({ ...q, childAges: [18] })).toMatch(/Kinder/);
    expect(parseStayQuery({ ...q, rooms: 3 })).toMatch(/Zimmer/);
    expect(parseStayQuery({ ...q, type: "zelt" })).toMatch(/Art/);
    expect(parseStayQuery({ ...q, sources: ["airbnb"] })).toBe("Unbekannte Quelle");
  });
});

describe("Unterkunftssuche in der App", () => {
  const trip = (): Trip => ({
    id: "t", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25",
    travelers: [
      { id: "a", name: "Anna", household: "K", age: 40 }, { id: "b", name: "Ben", household: "K", age: 12 },
      { id: "c", name: "Pinguin Kind", household: "P", kind: "child" }, { id: "d", name: "Pinguin Baby", household: "P", kind: "infant" },
      { id: "e", name: "Eva", household: "P" }, { id: "f", name: "Fritz", household: "P", age: 70, active: false }
    ],
    items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }
  });
  it("Gäste: bis 17 Kind mit Alter, Platzhalter-Kinder 8, Babys 1; wer nicht dabei ist, fehlt", () => {
    expect(guests(trip().travelers.filter(t => t.active !== false))).toEqual({ adults: 2, childAges: [12, 8, 1] });
  });
  it("Vorschlag aus der Reise, mit Zeitraum des Postens", () => {
    const t = trip();
    expect(defaultStayQuery(t)).toMatchObject({ place: "Split", country: "Kroatien", checkin: "2027-07-18", checkout: "2027-07-25", adults: 2, childAges: [12, 8, 1], type: "whole" });
    const it: Item = { id: "i", cat: "stay", name: "", status: "idea", options: [], from: "2027-07-20", to: "2027-07-22", participants: ["a", "b"] };
    expect(defaultStayQuery(t, it, "hotel")).toMatchObject({ checkin: "2027-07-20", checkout: "2027-07-22", adults: 1, childAges: [12], type: "hotel" });
  });
  it("Treffer als Angebot: Preis für den ganzen Aufenthalt, Quelle mit Portal", () => {
    const [o] = fromTrivago(trivago);
    const opt = stayToOption(o, 3);
    expect(opt).toMatchObject({ label: "Nennolina", price: { mode: "unit", basis: "stay", unit: 2575, capacity: 3, currency: "EUR" }, stay: { rating: 95 } });
    expect(opt.source).toMatchObject({ name: "Trivago über Airbnb", url: o.url });
  });
  it("Übernehmen: füllt einen leeren Posten, weitere kommen als Angebote dazu", () => {
    const t = trip();
    t.items.push({ id: "leer", cat: "stay", name: "", status: "idea", from: "2027-07-18", to: "2027-07-25", options: [{ id: "x", label: "", price: { mode: "unit", currency: "EUR" } }] });
    const [a, b] = fromBooking(booking);
    const it = takeStay(t, a, q);
    expect(it.id).toBe("leer");
    expect(it).toMatchObject({ name: "Unterkunft in Split", options: [{ label: "Antea" }] });
    takeStay(t, b, q, it.id);
    expect(it.options.map(x => x.label)).toEqual(["Antea", "Rooms Šećer"]);
    const neu = takeStay(t, a, { ...q, checkin: "2027-07-19" });
    expect(neu.id).not.toBe("leer");
    expect(t.items.filter(x => x.cat === "stay")).toHaveLength(2);
  });
});

describe("Verpflegung aus den Merkmalen der Unterkunft", () => {
  it("erkennt All-inclusive, Halbpension, Vollpension; Frühstück nur, wenn inklusive", () => {
    expect(boardOf(["Pool", "All Inclusive"])).toBe("all");
    expect(boardOf([], "Hotel Sol All-Inklusive")).toBe("all");
    expect(boardOf(["Halbpension"])).toBe("half");
    expect(boardOf(["Halbpension möglich", "Frühstück gegen Aufpreis"])).toBeUndefined();
    expect(boardOf(["Full board"])).toBe("full");
    expect(boardOf(["Frühstück inklusive"])).toBe("breakfast");
    expect(boardOf(["Breakfast included", "WLAN"])).toBe("breakfast");
    expect(boardOf(["Frühstück", "Parkplatz"])).toBeUndefined();
    expect(boardOf(["Küche"])).toBeUndefined();
  });
});

