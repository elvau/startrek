import { describe, expect, it } from "vitest";
import { fromTravelpayouts, searchTravelpayouts, tpParams } from "./travelpayouts";
import { searchAll } from "./search";
import type { FlightQuery } from "./types";

const q: FlightQuery = { from: "DUS", to: "SPU", depart: "2027-07-18", ret: "2027-07-29", adults: 2, children: 1, infants: 0, currency: "EUR" };
// Aufbau wie in der Doku der Aviasales Data API v3 (prices_for_dates)
const sample = {
  success: true, currency: "eur",
  data: [
    { origin: "DUS", destination: "SPU", origin_airport: "DUS", destination_airport: "SPU", price: 312, airline: "EW", flight_number: "9958",
      departure_at: "2027-07-18T06:10:00+02:00", return_at: "2027-07-29T14:25:00+02:00", transfers: 0, return_transfers: 0, duration: 235, duration_to: 115, duration_back: 120, link: "/search/DUS1807SPU29071?t=EW1" },
    { origin: "DUS", destination: "SPU", origin_airport: "DUS", destination_airport: "SPU", price: 280, airline: "OS", flight_number: "166",
      departure_at: "2027-07-18T18:45:00+02:00", return_at: "2027-07-29T12:00:00+02:00", transfers: 1, return_transfers: 1, duration: 500, duration_to: 245, duration_back: 255, link: "/search/DUS1807SPU29071?t=OS1" }
  ]
};

describe("Travelpayouts", () => {
  it("Anfrage: Flughafencodes, feste Daten, direkt nur bei 0 Umstiegen, Token nicht in der Adresse", () => {
    const p = tpParams({ ...q, maxStops: 0 }, "m123");
    expect(Object.fromEntries(p)).toMatchObject({ origin: "DUS", destination: "SPU", departure_at: "2027-07-18", return_at: "2027-07-29", direct: "true", currency: "eur", marker: "m123" });
    expect(p.has("token")).toBe(false);
    expect(tpParams({ ...q, ret: undefined }).get("one_way")).toBe("true");
    expect(tpParams({ ...q, latest: "2027-08-02", nightsMin: 7 }).get("return_at")).toBe("2027-08");
    expect(() => tpParams({ ...q, to: "Split" })).toThrow(/Flughafencodes/);
  });
  it("Antwort: Preis pro Person mal Reisende, Ankunft aus Flugdauer, Link mit Partnerkennung", () => {
    const [a, b] = fromTravelpayouts(sample, q, "m123");
    expect(a).toMatchObject({ source: "travelpayouts", price: 936, currency: "EUR", url: "https://www.aviasales.com/search/DUS1807SPU29071?t=EW1&marker=m123" });
    expect(a.out).toMatchObject({ from: "DUS", to: "SPU", dep: "2027-07-18T06:10:00", arr: "2027-07-18T08:05:00", minutes: 115, stops: 0, flights: ["EW9958"] });
    expect(a.back).toMatchObject({ from: "SPU", to: "DUS", dep: "2027-07-29T14:25:00", arr: "2027-07-29T16:25:00" });
    expect(b.out.stops).toBe(1);
    expect(fromTravelpayouts(sample, { ...q, maxStops: 0 })).toHaveLength(1);
  });
  it("Suche mit Token im Kopf; Fehler werden gemeldet", async () => {
    let seen: Headers | undefined;
    const ok = (async (_u: RequestInfo | URL, i?: RequestInit) => { seen = new Headers(i?.headers); return new Response(JSON.stringify(sample)); }) as typeof fetch;
    expect(await searchTravelpayouts(q, "geheim", ok)).toHaveLength(2);
    expect(seen?.get("x-access-token")).toBe("geheim");
    await expect(searchTravelpayouts(q, "x", (async () => new Response("", { status: 401 })) as typeof fetch)).rejects.toThrow("Travelpayouts antwortet mit 401");
  });
  it("mit Token läuft Travelpayouts neben Kiwi mit", async () => {
    const f = (async (u: RequestInfo | URL) => String(u).startsWith("https://api.travelpayouts.com") ? new Response(JSON.stringify(sample)) : new Response("", { status: 503 })) as typeof fetch;
    const r = await searchAll(q, { TRAVELPAYOUTS_TOKEN: "t" }, f);
    expect(r.sources.find(s => s.id === "travelpayouts")).toMatchObject({ configured: true, ok: true, count: 2 });
    expect(r.offers[0].price).toBe(840);
  });
});

describe("Travelpayouts: Fehlermeldungen", () => {
  it("gibt die Begründung aus der Antwort weiter", async () => {
    const bad = (async () => new Response(JSON.stringify({ success: false, error: "return_at must be after departure_at" }), { status: 400 })) as typeof fetch;
    await expect(searchTravelpayouts(q, "x", bad)).rejects.toThrow("Travelpayouts antwortet mit 400: return_at must be after departure_at");
    const plain = (async () => new Response("Bad Request", { status: 400 })) as typeof fetch;
    await expect(searchTravelpayouts(q, "x", plain)).rejects.toThrow("Travelpayouts antwortet mit 400: Bad Request");
  });
});
