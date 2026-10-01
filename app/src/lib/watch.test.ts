import { describe, expect, it } from "vitest";
import { applyRefresh, changed, findCheaper, flightQueryFor, hitFor, potential, refreshTrip, takeBetter, watchable, type Searchers } from "./watch";
import { summarize, isBooked } from "./overview";
import { offerToOption } from "./flights/app";
import { stayToOption } from "./stays/app";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";
import type { FlightOffer, OfferLeg } from "./flights/types";
import type { StayOffer } from "./stays/types";

const leg = (from: string, to: string, dep: string, arr: string, fl = "EW1"): OfferLeg => ({ from, to, dep, arr, minutes: 90, stops: 0, route: [from, to], carriers: ["EW"], flights: [fl] });
const flight = (price: number, outDep = "2027-05-07T08:00:00", fl = "EW1"): FlightOffer => ({
  id: "f" + price + outDep, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR",
  out: leg("DUS", "PMI", outDep, "2027-05-07T10:30:00", fl), back: leg("PMI", "DUS", "2027-05-10T18:00:00", "2027-05-10T20:30:00", fl)
});
const stay = (name: string, total: number): StayOffer => ({ id: name, source: "booking", sourceName: "Booking.com", name, total, currency: "EUR" });

function trip(): Trip {
  const f: Item = { id: "fl", cat: "flights", name: "Flug", status: "chosen", options: [offerToOption(flight(400))] };
  const so = stayToOption(stay("Casa Palma", 600), 2);
  so.query = { place: "Palma", country: "Spanien", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2, childAges: [], rooms: 1 };
  const s: Item = { id: "st", cat: "stay", name: "Unterkunft", status: "idea", from: "2027-05-07", to: "2027-05-10", options: [so] };
  const booked: Item = { id: "bk", cat: "stay", name: "Gebucht", status: "booked", from: "2027-05-07", to: "2027-05-08", options: [stayToOption(stay("Fix", 100), 2)] };
  return {
    id: "t", name: "Palma", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-10",
    travelers: [{ id: "a", name: "A", household: "X" }, { id: "b", name: "B", household: "X" }],
    items: [f, s, booked], tiers: {}, settings: DEFAULT_SETTINGS
  };
}

describe("Reisebeobachtung", () => {
  it("beobachtet nur Flüge und Unterkünfte aus der Suche, die nicht gebucht sind", () => {
    expect(watchable(trip()).map(i => i.id)).toEqual(["fl", "st"]);
  });

  it("sucht genau denselben Flug: Flughäfen, Daten, Personen", () => {
    const tr = trip();
    const q = flightQueryFor(tr, tr.items[0], tr.items[0].options[0])!;
    expect(q).toMatchObject({ from: "DUS", to: "PMI", fromAirports: ["DUS"], toAirports: ["PMI"], depart: "2027-05-07", ret: "2027-05-10", adults: 2, children: 0 });
  });

  it("Preise prüfen: dieselben Angebote zum heutigen Preis übernehmen, Änderung am Posten", async () => {
    const tr = trip();
    // zweites Unterkunfts-Angebot im Vergleich: wird mit aktualisiert
    const so2 = stayToOption(stay("Hostal Sol", 520), 2);
    tr.items[1].options.push(so2);
    tr.items[1].chosen = tr.items[1].options[0].id;
    const asked: unknown[] = [];
    const s: Searchers = {
      // derselbe Flug kostet jetzt 450, ein anderer 380 (zählt hier nicht)
      flights: async q => { asked.push(q); return { offers: [flight(450), flight(380, "2027-05-07T06:00:00", "EW7")], sources: [] }; },
      stays: async q => { asked.push(q); return { offers: [stay("Casa Palma", 560), stay("Hostal Sol", 500), stay("Billig", 300)], sources: [] }; }
    };
    applyRefresh(tr, await refreshTrip(tr, s), "2026-10-01T10:00:00Z");
    expect(asked).toHaveLength(2);
    expect(tr.items[0].options[0].price.unit).toBe(450);
    expect(tr.items[1].options.map(o => o.price.unit)).toEqual([560, 500]);
    expect(tr.items[1].options[0].source?.at).toBe("2026-10-01");
    expect(hitFor(tr, tr.items[0])).toMatchObject({ was: 400, now: 450 });
    expect(hitFor(tr, tr.items[1])).toMatchObject({ was: 600, now: 560 });
    expect(changed(tr)).toBe(50 - 40);
    // kein Vorschlag fremder Angebote bei der Prüfung der ganzen Reise
    expect(potential(tr)).toBe(0);
  });

  it("nicht wiedergefunden oder Fehler: Preis bleibt, Hinweis am Posten", async () => {
    const tr = trip();
    applyRefresh(tr, await refreshTrip(tr, {
      flights: async () => ({ offers: [flight(420, "2027-05-07T12:00:00")], sources: [] }),
      stays: async () => { throw new Error("weg"); }
    }));
    expect(tr.items[0].options[0].price.unit).toBe(400);
    expect(hitFor(tr, tr.items[0])).toMatchObject({ was: 400 });
    expect(hitFor(tr, tr.items[0])!.now).toBeUndefined();
    expect(hitFor(tr, tr.items[1])!.err).toBe("weg");
    expect(changed(tr)).toBe(0);
  });

  it("Günstigeres je Posten: bestes fremdes Angebot, Übernehmen wählt es", async () => {
    const tr = trip();
    const s: Searchers = {
      flights: async () => ({ offers: [flight(400)], sources: [] }),
      stays: async () => ({ offers: [stay("Casa Palma", 600), stay("Hostal Sol", 520)], sources: [] })
    };
    tr.watch = { at: "", items: { st: (await findCheaper(tr, tr.items[1], s))!, fl: (await findCheaper(tr, tr.items[0], s))! } };
    expect(hitFor(tr, tr.items[1])).toMatchObject({ was: 600, best: 520 });
    expect(hitFor(tr, tr.items[0])).toMatchObject({ noBetter: true });
    expect(potential(tr)).toBe(80);
    expect(summarize(tr, "2026-09-29").potential).toBe(80);
    takeBetter(tr, tr.items[1]);
    expect(tr.items[1].options.find(o => o.id === tr.items[1].chosen)!.label).toBe("Hostal Sol");
    expect(hitFor(tr, tr.items[1])).toBeNull();
    expect(potential(tr)).toBe(0);
  });

  it("anderes Angebot gewählt: altes Ergebnis zählt nicht mehr", async () => {
    const tr = trip();
    applyRefresh(tr, await refreshTrip(tr, { flights: async () => ({ offers: [flight(300)], sources: [] }), stays: async () => ({ offers: [], sources: [] }) }));
    expect(changed(tr)).toBe(-100);
    const o = offerToOption(flight(350, "2027-05-07T09:00:00"));
    tr.items[0].options.push(o); tr.items[0].chosen = o.id;
    expect(changed(tr)).toBe(0);
  });
});

describe("Reise auf einen Blick", () => {
  it("geplant, gebucht, vergangen; Nächte, Events, Verpflegung", () => {
    const tr = trip();
    tr.event = { name: "Konzert", start: "2027-05-08T20:00" };
    tr.items.push({ id: "at", cat: "attractions", name: "Bootstour", status: "idea", options: [] });
    tr.food = { on: true, style: "hb" };
    const s = summarize(tr, "2026-09-29");
    expect([s.state, s.where, s.nights, s.events, s.food, s.round]).toEqual(["planned", "Palma, Spanien", 3, 2, "hb", false]);
    expect(s.total).toBeGreaterThan(0);
    tr.items.forEach(i => { if (i.cat === "flights" || i.cat === "stay") i.status = "booked"; });
    expect(isBooked(tr)).toBe(true);
    expect(summarize(tr, "2026-09-29").state).toBe("booked");
    expect(summarize(tr, "2027-06-01").state).toBe("past");
  });
});
