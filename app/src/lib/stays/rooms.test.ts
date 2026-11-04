import { describe, expect, it } from "vitest";
import { askRooms, roomsFit, roomsOf, withRooms } from "./rooms";
import { factsOf } from "./providers";
import { mergeStays, parseStayQuery } from "./search";
import { keepStays } from "./sort";
import type { StayOffer } from "./types";

const o = (id: string, total: number, x: Partial<StayOffer> = {}): StayOffer => ({ id, source: id.split(":")[0], sourceName: "T", name: id, total, currency: "EUR", ...x });

describe("Schlafzimmer und Schlafplätze (#674)", () => {
  it("liest Namen und Auskünfte", () => {
    expect(roomsOf("Ferienhaus mit 4 Schlafzimmern für 10 Personen")).toEqual({ bedrooms: 4, sleeps: 10 });
    expect(roomsOf("Chalet, 3 SZ, bis 8 Pers.")).toEqual({ bedrooms: 3, sleeps: 8 });
    expect(roomsOf("The unit at Chalet Zippe features five bedrooms and can accommodate a total of ten guests.")).toEqual({ bedrooms: 5, sleeps: 10 });
    // mehrere Wohnungstypen: die größte Einheit
    expect(roomsOf("- **One-Bedroom Apartment**: Sleeps up to 4 guests.\n- **Two-Bedroom Apartment**: up to 6 guests.\n- **Three-Bedroom Apartment**: Can host up to 8 guests.")).toEqual({ bedrooms: 3, sleeps: 8 });
    expect(roomsOf("Sunny Studio Scharnitz")).toEqual({ bedrooms: 0 });
    expect(roomsOf("Landhotel Hirsch")).toEqual({});
    expect(roomsOf("The property does not specify the number of bedrooms.")).toEqual({});
  });
  it("filtert: ohne Angabe oder zu klein fällt weg", () => {
    expect(roomsFit({ bedrooms: 4 }, { bedroomsMin: 4 })).toBe(true);
    expect(roomsFit({ bedrooms: 3 }, { bedroomsMin: 4 })).toBe(false);
    expect(roomsFit({}, { bedroomsMin: 4 })).toBe(false);
    expect(roomsFit({ bedrooms: 5 }, { bedroomsMin: 4, sleepsMin: 9 })).toBe(false);
    expect(roomsFit({}, {})).toBe(true);
    const l = [o("a", 1, { bedrooms: 5, sleeps: 10 }), o("b", 2, { bedrooms: 0 }), o("c", 3)];
    expect(keepStays(l, { bedroomsMin: 4 }).map(x => x.id)).toEqual(["a"]);
    expect(keepStays(l, {})).toHaveLength(3);
  });
  it("Anfrage: Schlafzimmer setzt ein Zimmer und ganze Unterkunft", () => {
    const q = parseStayQuery({ place: "Scharnitz", checkin: "2027-12-30", checkout: "2028-01-03", adults: 6, childAges: [4, 7, 10], rooms: 4, type: "hotel", bedroomsMin: 4, sleepsMin: 9 });
    expect(q).toMatchObject({ rooms: 1, type: "whole", bedroomsMin: 4, sleepsMin: 9 });
    expect(parseStayQuery({ place: "X", checkin: "2027-12-30", checkout: "2028-01-03", adults: 2, bedroomsMin: 0 })).toBe("Schlafzimmer: 1 bis 20");
    expect(parseStayQuery({ place: "X", checkin: "2027-12-30", checkout: "2028-01-03", adults: 2, rooms: 2 })).toMatchObject({ rooms: 2, type: "all" });
  });
  it("Doppelte: Angabe der teureren Quelle bleibt erhalten", () => {
    const m = mergeStays([[o("trivago:1", 2000, { name: "Chalet Zippe" })], [o("booking:1", 2200, { name: "Chalet Zippe", bedrooms: 5, sleeps: 10 })]]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ id: "trivago:1", bedrooms: 5, sleeps: 10 });
    expect(withRooms(o("x", 1, { name: "Haus mit 4 Schlafzimmern" })).bedrooms).toBe(4);
  });
  it("fragt bei Booking.com nach, nur ganze Unterkünfte, eine Verbindung", async () => {
    const asked: number[] = [];
    let inits = 0;
    const f = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      if (b.method === "initialize") inits++;
      if (b.method !== "tools/call") return new Response(JSON.stringify({ jsonrpc: "2.0", id: b.id, result: {} }), { headers: { "content-type": "application/json" } });
      const id = b.params.arguments.hotel_ids[0];
      asked.push(id);
      const answer = id === 1 ? "The unit features five bedrooms and can accommodate a total of ten guests." : "No information.";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: b.id, result: { structuredContent: { answer } } }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const data = { accommodations: [{ id: 1, accommodationType: "Ferienwohnung" }, { id: 2, accommodationType: "Hotel" }, { id: 3, accommodationType: "Chalet" }] };
    const out = await askRooms([o("booking:1", 2200, { name: "Chalet Zippe" }), o("booking:2", 9000, { name: "HENRI Hotel" }), o("booking:3", 3000, { name: "Alm" })], data, "https://b", f);
    expect(asked.sort()).toEqual([1, 3]);
    expect(inits).toBe(1);
    expect(out.find(x => x.id === "booking:1")).toMatchObject({ bedrooms: 5, sleeps: 10 });
    expect(out.find(x => x.id === "booking:3")?.bedrooms).toBeUndefined();
  });

  it("Ausstattung aus Booking.com: Hallenbad, Wasserrutsche, Sauna (#681)", () => {
    expect(factsOf(["Parkplatz", "Sauna", "Innenpool (ganzjährig)", "Wasserrutsche", "Spielplatz mit Rutsche", "Familienzimmer", "Klimaanlage"]))
      .toEqual(["Pool", "Hallenbad", "Wasserrutsche", "Sauna", "Familienzimmer", "Parkplatz"]);
    expect(factsOf(["Spielplatz mit Rutsche"])).toEqual([]);
  });
});
