import { describe, expect, it } from "vitest";
import { fromViator, searchViator, viatorBody } from "./viator";
import { parseActivityQuery, rank, searchActivities } from "./search";
import { activityItem, eventItem } from "./app";

const VIATOR = { products: { totalCount: 2, results: [
  { productCode: "5010P1", title: "Sagrada Família: Führung ohne Anstehen", description: "Mit Guide durch die Basilika",
    images: [{ isCover: true, variants: [{ url: "https://img/s.jpg", width: 200, height: 150 }, { url: "https://img/m.jpg", width: 720, height: 480 }, { url: "https://img/l.jpg", width: 1200, height: 800 }] }],
    reviews: { totalReviews: 4312, combinedAverageRating: 4.73 }, duration: { fixedDurationInMinutes: 90 },
    pricing: { summary: { fromPrice: 47 }, currency: "EUR" }, productUrl: "https://www.viator.com/tours/x?pid=P&mcid=M" },
  { productCode: "9", title: "Neue Tour", reviews: { totalReviews: 2, combinedAverageRating: 5 }, duration: { variableDurationFromMinutes: 240, variableDurationToMinutes: 300 },
    pricing: { summary: { fromPrice: 30 }, currency: "USD" } },
  { title: "ohne Code" }
] } };

describe("Touren und Tickets (Viator)", () => {
  it("Anfrage prüfen und an Viator übersetzen", () => {
    expect(parseActivityQuery({ place: " Barcelona ", from: "2027-05-01", to: "2027-05-05", lang: "de" })).toEqual({ place: "Barcelona", from: "2027-05-01", to: "2027-05-05", lang: "de" });
    expect(parseActivityQuery({ place: "B" })).toMatch(/Ort/);
    expect(parseActivityQuery({ place: "Rom", from: "2027-05-05", to: "2027-05-01" })).toMatch(/endet/);
    expect(viatorBody({ place: "Barcelona", from: "2027-05-01", to: "2027-05-05" })).toMatchObject({ searchTerm: "Barcelona", currency: "EUR", searchTypes: [{ searchType: "PRODUCTS" }], productFiltering: { dateRange: { from: "2027-05-01", to: "2027-05-05" } } });
  });

  it("Ergebnis: Bild bis 720 px, Bewertung, Dauer, Preis ab, Partner-Link; gut und oft bewertet zuerst", () => {
    const list = fromViator(VIATOR);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: "viator:5010P1", source: "viator", sourceName: "Viator", title: "Sagrada Família: Führung ohne Anstehen", description: "Mit Guide durch die Basilika",
      image: "https://img/m.jpg", rating: 4.7, reviews: 4312, minutes: 90, price: 47, currency: "EUR", url: "https://www.viator.com/tours/x?pid=P&mcid=M" });
    expect(list[1]).toMatchObject({ minutes: 240, price: 30, currency: "USD" });
    // 5 Sterne aus 2 Bewertungen zählen weniger als 4,7 aus 4312
    expect(rank([list[1], list[0]]).map(a => a.id)).toEqual(["viator:5010P1", "viator:9"]);
  });

  it("Partner-Links nur mit Schalter: sonst ohne Partner-Kennung und nicht als Partner gekennzeichnet", async () => {
    const f = (async () => new Response(JSON.stringify(VIATOR))) as unknown as typeof fetch;
    const off = await searchActivities({ place: "Rom" }, { VIATOR_API_KEY: "x" }, f);
    const t1 = off.activities.find(a => a.url)!;
    expect(t1.url).toBe("https://www.viator.com/tours/x");
    expect(t1.sponsored).toBeUndefined();
    const on = await searchActivities({ place: "Rom" }, { VIATOR_API_KEY: "x", PARTNER_LINKS: "on" }, f);
    expect(on.activities.find(a => a.url)).toMatchObject({ url: "https://www.viator.com/tours/x?pid=P&mcid=M", sponsored: true });
  });

  it("Aufruf: Partner-Schlüssel, Version 2.0, Sprache; ohne Schlüssel aus", async () => {
    let head: Record<string, string> = {};
    const f = (async (_u: string, init: RequestInit) => { head = init.headers as Record<string, string>; return new Response(JSON.stringify(VIATOR)); }) as unknown as typeof fetch;
    await searchViator({ place: "Barcelona", lang: "de" }, "KEY", f);
    expect(head).toMatchObject({ "exp-api-key": "KEY", accept: "application/json;version=2.0", "accept-language": "de-DE" });
    await searchViator({ place: "Barcelona", lang: "pl" }, "KEY", f);
    expect(head["accept-language"]).toBe("en-US");
    expect((await searchActivities({ place: "Rom" }, {})).sources).toEqual([{ id: "viator", name: "Viator", configured: false, ok: false, count: 0 }]);
    const bad = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect((await searchActivities({ place: "Rom" }, { VIATOR_API_KEY: "x" }, bad)).sources[0]).toMatchObject({ ok: false, error: "Viator 401" });
  });

  it("als Posten: Preis pro Person nur in Euro, sonst selbst eintragen; Link und Termin bleiben", () => {
    const [tour, usd] = fromViator(VIATOR);
    const a = activityItem(tour);
    expect(a).toMatchObject({ cat: "attractions", name: tour.title, status: "idea" });
    expect(a.options[0]).toMatchObject({ price: { mode: "person", currency: "EUR", adult: 47 }, source: { name: "Viator", url: tour.url } });
    expect(a.options[0].detail).toContain("4.7");
    expect(activityItem(usd).options[0]).toMatchObject({ price: { adult: 0 }, estimate: true });
    // Foto der Tour wird mitgenommen, nur über https
    expect(activityItem({ ...tour, image: "https://media-cdn.tripadvisor.com/x.jpg" }).options[0].image).toBe("https://media-cdn.tripadvisor.com/x.jpg");
    expect(activityItem({ ...tour, image: "http://x/y.jpg" }).options[0].image).toBeUndefined();
    const e = eventItem({ id: "tm:1", source: "ticketmaster", sourceName: "Ticketmaster", name: "Coldplay", start: "2027-05-02T20:00", venue: "San Siro", city: "Milano", price: { min: 65, currency: "EUR" }, url: "https://tm/1" });
    expect(e.note).toContain("20:00 · San Siro, Milano");
    expect(e.options[0]).toMatchObject({ price: { mode: "person", adult: 65 }, source: { name: "Ticketmaster", url: "https://tm/1" } });
  });
});
