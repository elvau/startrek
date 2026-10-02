import { describe, expect, it } from "vitest";
import { duffelBody, duffelFits, fromDuffel, isoMinutes, searchDuffel } from "./duffel";
import type { FlightQuery } from "./types";

const q: FlightQuery = { from: "DUS", to: "PMI", depart: "2027-08-12", ret: "2027-08-19", adults: 2, children: 1, infants: 1, maxStops: 1 };
const seg = (o: string, d: string, dep: string, arr: string, c = "LH", n = "123", bags = 1) => ({
  origin: { iata_code: o }, destination: { iata_code: d }, departing_at: dep, arriving_at: arr,
  marketing_carrier: { name: c === "LH" ? "Lufthansa" : "Eurowings", iata_code: c }, marketing_carrier_flight_number: n,
  passengers: [{ baggages: [{ type: "checked", quantity: bags }, { type: "carry_on", quantity: 1 }] }, { baggages: [{ type: "checked", quantity: bags }] }]
});
const offer = (id: string, amount: string, cur = "EUR") => ({
  id, total_amount: amount, total_currency: cur, owner: { name: "Lufthansa" },
  slices: [
    { origin: { iata_code: "DUS", city_name: "Düsseldorf" }, destination: { iata_code: "PMI", city_name: "Palma" }, duration: "PT4H10M",
      segments: [seg("DUS", "FRA", "2027-08-12T06:00:00", "2027-08-12T07:00:00"), seg("FRA", "PMI", "2027-08-12T08:30:00", "2027-08-12T10:10:00", "LH", "1150")] },
    { origin: { iata_code: "PMI" }, destination: { iata_code: "DUS" }, duration: "PT2H15M", segments: [seg("PMI", "DUS", "2027-08-19T18:00:00", "2027-08-19T20:15:00", "EW", "9581")] }
  ]
});

describe("Duffel", () => {
  it("Anfrage: Strecken, Reisende mit Alter, Umstiege", () => {
    const b = duffelBody({ ...q, fromCityCode: "DUS", toAirports: ["PMI"] }).data;
    expect(b.slices).toEqual([{ origin: "DUS", destination: "PMI", departure_date: "2027-08-12" }, { origin: "PMI", destination: "DUS", departure_date: "2027-08-19" }]);
    expect(b.passengers).toEqual([{ type: "adult" }, { type: "adult" }, { age: 10 }, { type: "infant_without_seat" }]);
    expect(b.max_connections).toBe(1);
    expect(duffelBody({ ...q, ret: undefined }).data.slices).toHaveLength(1);
  });
  it("nur feste Daten", () => {
    expect(duffelFits(q)).toBe(true);
    expect(duffelFits({ ...q, latest: "2027-08-30" })).toBe(false);
    expect(duffelFits({ ...q, ret: undefined, departTo: "2027-08-20" })).toBe(false);
    expect(duffelFits({ ...q, flexDays: 2 })).toBe(false);
  });
  it("Dauer aus ISO 8601", () => {
    expect(isoMinutes("PT2H5M")).toBe(125);
    expect(isoMinutes("P1DT3H")).toBe(1620);
    expect(isoMinutes(undefined)).toBe(0);
  });
  it("Angebote: Strecken, Umstiege, Koffer; Währung der Airline (umgerechnet wird in der Suche), günstigste zuerst", () => {
    const l = fromDuffel({ data: { offers: [offer("b", "812.40"), offer("a", "640.00"), offer("c", "300.00", "GBP")] } });
    expect(l.map(o => o.id)).toEqual(["duffel:c", "duffel:a", "duffel:b"]);
    expect(l[0].currency).toBe("GBP");
    l.shift();
    const o = l[0];
    expect(o.price).toBe(640);
    expect(o.sourceName).toBe("Duffel · Lufthansa");
    expect(o.out).toMatchObject({ from: "DUS", to: "PMI", fromCity: "Düsseldorf", dep: "2027-08-12T06:00:00", arr: "2027-08-12T10:10:00", minutes: 250, stops: 1, route: ["DUS", "FRA", "PMI"], carriers: ["Lufthansa"], flights: ["LH123", "LH1150"] });
    expect(o.out.layovers).toEqual([{ at: "FRA", hours: 1.5 }]);
    expect(o.back).toMatchObject({ from: "PMI", to: "DUS", stops: 0, carriers: ["Eurowings"] });
    expect(o.baggage).toEqual({ personal: 1, cabin: 0, checked: 1 });
  });
  it("Token im Kopf, Fehlertext der Schnittstelle", async () => {
    let auth = "", ver = "";
    const ok = (async (_u: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      auth = h.authorization; ver = h["duffel-version"];
      return new Response(JSON.stringify({ data: { offers: [offer("a", "640.00")] } }));
    }) as unknown as typeof fetch;
    expect(await searchDuffel(q, "tok", ok)).toHaveLength(1);
    expect([auth, ver]).toEqual(["Bearer tok", "v2"]);
    const bad = (async () => new Response(JSON.stringify({ errors: [{ message: "Invalid token" }] }), { status: 401 })) as unknown as typeof fetch;
    await expect(searchDuffel(q, "x", bad)).rejects.toThrow("Duffel 401: Invalid token");
    expect(await searchDuffel({ ...q, latest: "2027-08-30" }, "tok", bad)).toEqual([]);
  });
});
