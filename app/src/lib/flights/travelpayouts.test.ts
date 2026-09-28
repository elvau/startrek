import { describe, expect, it } from "vitest";
import { TP_MAX, fromTravelpayouts, searchTravelpayouts, tpPairs, tpParams, tpRoutes } from "./travelpayouts";
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
    expect(tpParams({ ...q, latest: "2027-08-02", nightsMin: 7 }).get("return_at")).toBe("2027-07");
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

describe("Travelpayouts: flexibler Zeitraum", () => {
  it("jeder Hinflug-Monat mit Rückflug im selben und im nächsten Monat, höchstens 6", () => {
    // Fall aus der App: 29.09. bis 28.11., 7 bis 14 Nächte
    expect(tpPairs({ ...q, depart: "2026-09-29", latest: "2026-11-28", nightsMin: 7, nightsMax: 14 })).toEqual([
      ["2026-09", "2026-09"], ["2026-09", "2026-10"], ["2026-10", "2026-10"], ["2026-10", "2026-11"], ["2026-11", "2026-11"]
    ]);
    expect(tpPairs({ ...q, depart: "2027-01-01", latest: "2027-12-31", nightsMin: 7 })).toHaveLength(6);
    expect(tpPairs(q)).toEqual([["2027-07-18", "2027-07-29"]]);
  });
  it("fragt alle Monate, führt zusammen; ein Fehler zählt nur, wenn alles scheitert", async () => {
    const asked: string[] = [];
    const f = (async (u: RequestInfo | URL) => {
      const p = new URL(String(u)).searchParams;
      asked.push(`${p.get("departure_at")}/${p.get("return_at")}`);
      return p.get("departure_at") === "2027-07" ? new Response("", { status: 500 }) : new Response(JSON.stringify(sample));
    }) as typeof fetch;
    const r = await searchTravelpayouts({ ...q, ret: undefined, depart: "2027-07-10", latest: "2027-08-20", nightsMin: 7, nightsMax: 14 }, "t", f);
    expect(asked).toEqual(["2027-07/2027-07", "2027-07/2027-08", "2027-08/2027-08"]);
    expect(r.length).toBeGreaterThan(0);
    expect(new Set(r.map(o => o.id)).size).toBe(r.length);
  });
});

describe("Travelpayouts mit mehreren Flughäfen", () => {
  it("Stadt mit Stadt-Code: eine Anfrage; Umkreis: eine je Flughafen", () => {
    expect(tpRoutes({ ...q, to: "TYO", toAirports: ["HND", "NRT"], toCityCode: "TYO" }, 1)).toEqual([["DUS", "TYO"]]);
    expect(tpRoutes({ ...q, to: "SPU", toAirports: ["SPU", "BWK", "DBV"] }, 1)).toEqual([["DUS", "SPU"], ["DUS", "BWK"], ["DUS", "DBV"]]);
    expect(tpRoutes(q, 1)).toEqual([["DUS", "SPU"]]);
  });

  it("höchstens TP_MAX Anfragen (Flughäfen × Monate), die nächsten Flughäfen zuerst", () => {
    const many = { ...q, to: "SPU", toAirports: ["SPU", "BWK", "DBV", "ZAD", "OMO", "ZAG"] };
    expect(tpRoutes(many, 1)).toHaveLength(6);
    expect(tpRoutes(many, 6).map(r => r[1])).toEqual(["SPU", "BWK"]);
    expect(tpRoutes(many, 20)).toHaveLength(1);
    expect(TP_MAX).toBe(12);
  });

  it("fragt je Flughafen und führt zusammen", async () => {
    const asked: string[] = [];
    const f = (async (url: string) => {
      const dest = new URL(url).searchParams.get("destination")!;
      asked.push(dest);
      return Response.json({ success: true, currency: "eur", data: [{ ...sample.data[0], destination: dest, destination_airport: dest, price: dest === "BWK" ? 100 : 300 }] });
    }) as unknown as typeof fetch;
    const offers = await searchTravelpayouts({ ...q, toAirports: ["SPU", "BWK"] }, "t", f);
    expect(asked.sort()).toEqual(["BWK", "SPU"]);
    expect(offers.map(o => o.out.to)).toEqual(["BWK", "SPU"]);
  });
});
