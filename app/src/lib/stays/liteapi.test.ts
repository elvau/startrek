import { describe, expect, it } from "vitest";
import { boardOfLite, fromLite, liteFits, occupancies, searchLite } from "./liteapi";
import type { StayQuery } from "./types";

const q: StayQuery = { place: "Palma", cc: "ES", checkin: "2027-08-12", checkout: "2027-08-19", adults: 3, childAges: [8, 5], rooms: 2, type: "all", currency: "EUR" };
const HOTELS = [
  { id: "lp1", name: "Hotel Sol", latitude: 39.57, longitude: 2.65, stars: 4, rating: 8.6, reviewCount: 1200, main_photo: "https://img.example/sol.jpg", address: "Carrer 1", city: "Palma" },
  { id: "lp2", name: "Hostal Mar", latitude: "39.56", longitude: "2.63", stars: 2, main_photo: "http://unsicher.example/x.jpg" }
];
const rate = (occ: number, amount: number, board = "RO", tag = "NRFN") => ({ occupancyNumber: occ, boardType: board, boardName: board === "BB" ? "Breakfast Included" : "Room Only", retailRate: { total: [{ amount, currency: "EUR" }] }, cancellationPolicies: { refundableTag: tag } });
const RATES = [
  { hotelId: "lp1", roomTypes: [
    { offerRetailRate: { amount: 1400, currency: "EUR" }, rates: [rate(1, 700), rate(2, 700)] },
    { offerRetailRate: { amount: 1700, currency: "EUR" }, rates: [rate(1, 850, "BB", "RFN"), rate(2, 850, "BB", "RFN")] }
  ] },
  { hotelId: "lp2", roomTypes: [{ rates: [rate(1, 300), rate(1, 280), rate(2, 310)] }] },
  { hotelId: "lp9", roomTypes: [{ offerRetailRate: { amount: 99, currency: "EUR" }, rates: [rate(1, 99)] }] }
];

describe("liteAPI", () => {
  it("Gäste auf Zimmer verteilen", () => {
    expect(occupancies(q)).toEqual([{ adults: 2, children: [8] }, { adults: 1, children: [5] }]);
    expect(occupancies({ adults: 1, childAges: [], rooms: 3 })).toEqual([{ adults: 1, children: [] }]);
  });
  it("nur Hotels, keine Ausstattung, die liteAPI nicht prüft", () => {
    expect(liteFits(q)).toBe(true);
    expect(liteFits({ ...q, type: "whole" })).toBe(false);
    expect(liteFits({ ...q, must: ["pool"] })).toBe(false);
    expect(liteFits({ ...q, must: ["breakfast", "freeCancel"] })).toBe(true);
  });
  it("Verpflegung aus Kürzel oder Name", () => {
    expect([boardOfLite("RO"), boardOfLite("BB"), boardOfLite(undefined, "Half Board"), boardOfLite("AI"), boardOfLite("XX")]).toEqual(["self", "breakfast", "half", "all", undefined]);
  });
  it("günstigstes Angebot je Hotel mit Lage, Foto, Sternen; unbekannte Hotels fallen raus", () => {
    const l = fromLite(HOTELS, RATES, q);
    expect(l.map(o => [o.name, o.total])).toEqual([["Hotel Sol", 1400], ["Hostal Mar", 590]]);
    expect(l[0]).toMatchObject({ id: "liteapi:lp1", source: "liteapi", score: 8.6, reviews: 1200, stars: 4, lat: 39.57, lon: 2.65, image: "https://img.example/sol.jpg", board: "self", place: "Carrer 1, Palma" });
    expect(l[1].image).toBeUndefined();
    expect(l[1].lat).toBe(39.56);
  });
  it("Frühstück und kostenlose Stornierung als Pflicht wählen die passende Rate", () => {
    const l = fromLite(HOTELS, RATES, { ...q, must: ["breakfast", "freeCancel"] });
    expect(l.map(o => [o.name, o.total, o.board])).toEqual([["Hotel Sol", 1700, "breakfast"]]);
    expect(l[0].facts).toEqual(["Kostenlos stornierbar"]);
  });
  it("Link zur eigenen Buchungsseite, falls eingerichtet", () => {
    expect(fromLite(HOTELS, RATES, q, "https://buchen.example/")[0].url).toBe("https://buchen.example/hotels/lp1?checkin=2027-08-12&checkout=2027-08-19&adults=3&children=8,5");
  });
  it("zwei Schritte: Hotels am Ort, dann Preise für diese Hotels; Schlüssel im Kopf", async () => {
    const calls: { url: string; key: string; body?: unknown }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, key: (init.headers as Record<string, string>)["x-api-key"], body: init.body ? JSON.parse(init.body as string) : undefined });
      return new Response(JSON.stringify(url.includes("/data/hotels") ? { data: HOTELS } : { data: RATES }));
    }) as unknown as typeof fetch;
    const l = await searchLite({ ...q, minStars: 3 }, "k", f);
    expect(calls[0].url).toBe("https://api.liteapi.travel/v3.0/data/hotels?countryCode=ES&cityName=Palma&limit=60");
    expect(calls[1].body).toMatchObject({ hotelIds: ["lp1"], checkin: "2027-08-12", currency: "EUR", guestNationality: "DE" });
    expect(calls.every(c => c.key === "k")).toBe(true);
    expect(l.map(o => o.name)).toEqual(["Hotel Sol"]);
    await expect(searchLite({ ...q, cc: undefined }, "k", f)).rejects.toThrow(/Land/);
    // Ort unter dem Namen unbekannt („Palma“ statt „Palma de Mallorca“): Umkreis um die Koordinaten
    const seen: string[] = [];
    const g = (async (url: string) => {
      seen.push(url);
      return new Response(JSON.stringify(url.includes("/data/hotels") ? { data: url.includes("cityName") ? [] : HOTELS } : { data: RATES }));
    }) as unknown as typeof fetch;
    expect((await searchLite({ ...q, lat: 39.57, lon: 2.65 }, "k", g)).length).toBe(2);
    expect(seen[1]).toBe("https://api.liteapi.travel/v3.0/data/hotels?countryCode=ES&latitude=39.57&longitude=2.65&radius=10000&distance=10000&limit=60");
    // Hotels zum Namen, aber ohne Preise: ebenfalls Umkreis
    const seen2: string[] = [];
    const h = (async (url: string) => {
      seen2.push(url);
      return new Response(JSON.stringify(url.includes("/data/hotels") ? { data: HOTELS } : { data: seen2.some(u => u.includes("latitude")) ? RATES : [] }));
    }) as unknown as typeof fetch;
    expect((await searchLite({ ...q, lat: 39.57, lon: 2.65 }, "k", h)).length).toBe(2);
    expect(seen2.filter(u => u.includes("/data/hotels"))).toHaveLength(2);
    expect(await searchLite({ ...q, type: "whole" }, "k", f)).toEqual([]);
  });

  it("Steuern und Gebühren: vor Ort bzw. enthalten, je Art zusammengefasst, als Nebenkosten übernommen", async () => {
    const withFees = (occ: number, amount: number) => ({ ...rate(occ, amount), retailRate: { total: [{ amount, currency: "EUR" }], taxesAndFees: [
      { included: false, description: "City tax", amount: 21, currency: "EUR" }, { included: true, description: "VAT", amount: 50, currency: "EUR" }, { included: false, description: "Resort fee", amount: 5, currency: "USD" }] } });
    const l = fromLite(HOTELS, [{ hotelId: "lp2", roomTypes: [{ rates: [withFees(1, 300), withFees(2, 310)] }] }], q);
    expect(l[0].fees).toEqual([{ label: "City tax", amount: 42, included: false }, { label: "VAT", amount: 100, included: true }]);
    const { stayToOption } = await import("./app");
    const o = stayToOption(l[0], 3, "Palma");
    expect(o.extras!.map(x => [x.kind, x.amount, x.pay, x.basis])).toEqual([["citytax", 42, "onsite", "booking"], ["tax", 100, "included", "booking"]]);
  });
});
