import { describe, expect, it } from "vitest";
import { earlier, eventDays, fits, fixWindow, km, nearestStay, pickStay, pickStayNear, planTotal, followEventName, takePlan, ticketsEur, variants, keepEnd } from "./plan";
import { calcItem } from "../calc";
import { DEFAULT_SETTINGS, type Trip } from "../model";
import type { FlightOffer, OfferLeg } from "../flights/types";
import type { StayOffer } from "../stays/types";

const leg = (dep: string, arr: string): OfferLeg => ({ from: "DUS", to: "LHR", dep, arr, minutes: 75, stops: 0, route: ["DUS", "LHR"], carriers: ["EW"], flights: ["EW1"] });
const offer = (out: [string, string], back: [string, string], price = 200): FlightOffer => ({
  id: out[0] + back[0], source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR", out: leg(...out), back: { ...leg(...back), from: "LHR", to: "DUS" }
});
const stay = (name: string, total: number, score?: number): StayOffer => ({ id: name, source: "booking", sourceName: "Booking.com", name, total, currency: "EUR", score });
const trip = (): Trip => ({ id: "t", name: "Reise", place: "London", country: "Vereinigtes Königreich", travelers: [{ id: "a", name: "A", household: "X" }, { id: "b", name: "B", household: "X" }], items: [], tiers: {}, settings: DEFAULT_SETTINGS });

describe("Reise zu einem Anlass", () => {
  it("Nachmittagsspiel: ohne Nacht, mit einer Nacht, ab Vortag", () => {
    const v = variants({ name: "Spiel", start: "2027-05-15T15:30" });
    expect(v.map(x => [x.kind, x.out, x.back, x.nights])).toEqual([
      ["day", "2027-05-15", "2027-05-15", 0], ["short", "2027-05-15", "2027-05-16", 1], ["relaxed", "2027-05-14", "2027-05-16", 2]
    ]);
  });

  it("Abendspiel: kein Tagesausflug mehr", () => {
    expect(variants({ name: "Spiel", start: "2027-05-15T20:00" }).map(x => x.kind)).toEqual(["short", "relaxed"]);
  });

  it("Flug passt nur, wenn er 3 h vorher landet und 2,5 h nach dem Ende zurückfliegt", () => {
    const [day, short, relaxed] = variants({ name: "Spiel", start: "2027-05-15T15:30", hours: 2 });
    // Ende 17:30, Rückflug ab 20:00
    expect(fits(offer(["2027-05-15T08:00", "2027-05-15T12:30"], ["2027-05-15T20:00", "2027-05-15T22:15"]), day)).toBe(true);
    expect(fits(offer(["2027-05-15T09:00", "2027-05-15T12:45"], ["2027-05-15T20:00", "2027-05-15T22:15"]), day)).toBe(false);
    expect(fits(offer(["2027-05-15T08:00", "2027-05-15T12:30"], ["2027-05-15T19:30", "2027-05-15T21:45"]), day)).toBe(false);
    expect(fits(offer(["2027-05-15T08:00", "2027-05-15T12:30"], ["2027-05-16T07:00", "2027-05-16T09:15"]), short)).toBe(true);
    expect(fits(offer(["2027-05-14T18:00", "2027-05-14T19:15"], ["2027-05-16T18:00", "2027-05-16T20:15"]), relaxed)).toBe(true);
    expect(fits(offer(["2027-05-15T08:00", "2027-05-15T12:30"], ["2027-05-16T18:00", "2027-05-16T20:15"]), relaxed)).toBe(false);
  });

  it("mehrtägig (Rennwochenende Fr–So, #265): kein Tagesausflug, Nächte über alle Event-Tage", () => {
    const ev = { name: "Grand Prix", start: "2027-07-02T13:00", end: "2027-07-04", hours: 4 };
    expect(eventDays(ev)).toEqual(["2027-07-02", "2027-07-03", "2027-07-04"]);
    expect(variants(ev).map(x => [x.kind, x.out, x.back, x.nights])).toEqual([
      ["short", "2027-07-02", "2027-07-05", 3], ["relaxed", "2027-07-01", "2027-07-05", 4]
    ]);
    // Rückflug am Sonntag erst nach dem Ende (17:00 + 2,5 h)
    const short = variants(ev)[0];
    expect(fits(offer(["2027-07-02T06:00", "2027-07-02T08:00"], ["2027-07-05T10:00", "2027-07-05T12:00"]), short)).toBe(true);
  });

  it("eigener Zeitraum: günstigste Verbindung darin, die das ganze Event abdeckt", () => {
    const ev = { name: "Grand Prix", start: "2027-07-02T13:00", end: "2027-07-04", hours: 4 };
    const w = variants(ev, { from: "2027-06-28", to: "2027-07-10" }).find(x => x.kind === "window")!;
    expect(w.window).toEqual({ from: "2027-06-28", to: "2027-07-10" });
    // Mittwoch bis Mittwoch passt, Rückflug am Sonntagmittag (vor dem Ende) nicht, Abflug vor dem Zeitraum nicht
    const ok = offer(["2027-06-30T09:00", "2027-06-30T11:00"], ["2027-07-07T12:00", "2027-07-07T14:00"]);
    expect(fits(ok, w)).toBe(true);
    expect(fits(offer(["2027-06-30T09:00", "2027-06-30T11:00"], ["2027-07-04T12:00", "2027-07-04T14:00"]), w)).toBe(false);
    expect(fits(offer(["2027-06-27T09:00", "2027-06-27T11:00"], ["2027-07-07T12:00", "2027-07-07T14:00"]), w)).toBe(false);
    expect(fixWindow(w, ok)).toMatchObject({ out: "2027-06-30", back: "2027-07-07", nights: 7 });
    // Zeitraum nicht größer als „ab Vortag“: kein eigener Vorschlag
    expect(variants(ev, { from: "2027-07-01", to: "2027-07-05" }).some(x => x.kind === "window")).toBe(false);
  });

  it("Unterkunft am nächsten am Event mit Entfernung", () => {
    const at = { lat: 51.555, lon: -0.108 };
    const near = { ...stay("Nah", 220, 8.1), lat: 51.56, lon: -0.1 }, far = { ...stay("Weit", 120, 8.9), lat: 51.45, lon: -0.45 };
    const r = nearestStay([far, near, stay("ohne Lage", 90)], at)!;
    expect(r.offer.name).toBe("Nah");
    expect(r.km).toBeLessThan(1);
    expect(nearestStay([near])).toBeNull();
  });

  it("Unterkunft: günstigste gut bewertete, sonst günstigste", () => {
    expect(pickStay([stay("A", 90, 6.5), stay("B", 140, 8.4), stay("C", 180, 9.1)])?.name).toBe("B");
    expect(pickStay([stay("A", 90, 6.5), stay("B", 140)])?.name).toBe("A");
    expect(pickStay([])).toBeNull();
  });

  it("Unterkunft nahe am Veranstaltungsort bevorzugt", () => {
    const at = { lat: 51.555, lon: -0.108 };
    const near = { ...stay("Nah", 220, 8.1), lat: 51.56, lon: -0.1 }, far = { ...stay("Weit", 120, 8.9), lat: 51.45, lon: -0.45 };
    expect(Math.round(km(at, far))).toBeGreaterThan(20);
    expect(pickStayNear([far, near], at)?.name).toBe("Nah");
    expect(pickStayNear([far, near])?.name).toBe("Weit");
    expect(pickStayNear([far], at)?.name).toBe("Weit");
  });

  it("Übernehmen setzt Daten und legt Flug und Unterkunft an", () => {
    const tr = trip();
    const [, short] = variants({ name: "Spiel", start: "2027-05-15T15:30" });
    const q = { place: "London", checkin: "", checkout: "", adults: 2, childAges: [], rooms: 1, type: "all" as const };
    takePlan(tr, short, offer(["2027-05-15T08:00", "2027-05-15T09:15"], ["2027-05-16T07:00", "2027-05-16T09:15"], 320), stay("Hotel", 180, 8.2), q);
    expect([tr.from, tr.to]).toEqual(["2027-05-15", "2027-05-16"]);
    expect(tr.items.map(i => i.cat)).toEqual(["flights", "stay"]);
    expect(tr.items[1]).toMatchObject({ from: "2027-05-15", to: "2027-05-16" });
    expect(tr.detail).toEqual({ flights: true, stay: true });
  });
});

describe("Fernziel: Hinflug einen Tag früher (#536)", () => {
  it("verschiebt Abflug und Nächte, Rückreise bleibt", () => {
    const relaxed = variants({ name: "Konzert", start: "2027-05-15T20:00" })[1];
    const e = earlier(relaxed);
    expect([e.out, e.back, e.nights]).toEqual(["2027-05-13", "2027-05-16", 3]);
    // Flug ab dem Vortag-des-Vortags, Landung am Vortag, passt jetzt
    expect(fits(offer(["2027-05-13T18:00", "2027-05-14T09:00"], ["2027-05-16T18:00", "2027-05-16T20:15"]), relaxed)).toBe(false);
    expect(fits(offer(["2027-05-13T18:00", "2027-05-14T09:00"], ["2027-05-16T18:00", "2027-05-16T20:15"]), e)).toBe(true);
  });
});

describe("planTotal", () => {
  it("ohne Flug kein Gesamtpreis, auch nicht nur aus der Unterkunft", () => {
    expect(planTotal(null, stay("Hotel", 300))).toBeNull();
    expect(planTotal(null, null)).toBeNull();
  });
  it("mit Flug: Flug plus gerundete Unterkunft", () => {
    expect(planTotal({ total: 200 }, stay("Hotel", 300.4))).toBe(500);
    expect(planTotal({ total: 200 }, null)).toBe(200);
  });
});

describe("Reisename folgt dem Anlass (#379)", () => {
  it("Wechsel des Anlasses ändert den automatischen Namen, ein eigener Name bleibt", () => {
    const t = trip();
    followEventName(t, undefined, "Spiel A");
    expect(t.name).toBe("Spiel A");
    followEventName(t, "Spiel A", "Konzert B");
    expect(t.name).toBe("Konzert B");
    t.name = "Unser Ausflug";
    followEventName(t, "Konzert B", "Spiel C");
    expect(t.name).toBe("Unser Ausflug");
  });
});

describe("Event mit letztem Tag (#450)", () => {
  it("Vorschläge decken alle Event-Tage ab: Anreise am ersten, Rückreise am Tag nach dem letzten", () => {
    const v = variants({ name: "Turnier", start: "2027-06-04T10:00", end: "2027-06-06" });
    expect(v.map(x => [x.kind, x.out, x.back, x.nights])).toEqual([["short", "2027-06-04", "2027-06-07", 3], ["relaxed", "2027-06-03", "2027-06-07", 4]]);
  });
  it("Treffer aus der Suche ohne Ende behält den eingetragenen letzten Tag", () => {
    expect(keepEnd({}, "2027-06-04", "2027-06-06")).toBe("2027-06-06");
    expect(keepEnd({ end: "2027-06-05" }, "2027-06-04", "2027-06-06")).toBe("2027-06-05");
    expect(keepEnd({}, "2027-06-08", "2027-06-06")).toBe("");
  });
});

describe("Tickets beim Übernehmen", () => {
  const take = (tr: Trip) => {
    const [, short] = variants(tr.event!);
    takePlan(tr, short, offer(["2027-05-15T08:00", "2027-05-15T09:15"], ["2027-05-16T07:00", "2027-05-16T09:15"], 320), null, null);
  };
  it("Spanne im Detail, gerechnet mit dem günstigsten Ticket pro Person", () => {
    const tr = trip();
    tr.event = { name: "Coldplay", start: "2027-05-15T20:00", url: "https://tickets.example/x", price: { min: 89, max: 250, currency: "EUR" } };
    take(tr);
    const it = tr.items.find(i => i.cat === "attractions")!;
    expect(it.name).toContain("Coldplay");
    expect(it.options[0].price).toEqual({ mode: "person", currency: "EUR", adult: 89 });
    expect(it.options[0].detail).toMatch(/89.*250/);
    expect(it.options[0].estimate).toBeUndefined();
    expect(calcItem(it, tr).net).toBe(178);
    expect(tr.event.item).toBe(it.id);
    expect(tr.detail?.attractions).toBe(true);
  });
  it("erneut übernommen: derselbe Posten, neuer Preis", () => {
    const tr = trip();
    tr.event = { name: "Spiel", start: "2027-05-15T15:30", price: { min: 40, currency: "EUR" } };
    take(tr);
    tr.event.price = { min: 55, currency: "EUR" };
    take(tr);
    const tix = tr.items.filter(i => i.cat === "attractions");
    expect(tix.length).toBe(1);
    expect(tix[0].options[0].price.adult).toBe(55);
  });
  it("ohne Preis trotzdem als Schätzung zum Nachtragen", () => {
    const tr = trip();
    tr.event = { name: "Spiel", start: "2027-05-15T15:30" };
    take(tr);
    const it = tr.items.find(i => i.cat === "attractions")!;
    expect(it.options[0]).toMatchObject({ estimate: true, price: { adult: 0 } });
  });
  it("Summe für den Vorschlag: Mindestpreis mal Personen, in Euro", () => {
    expect(ticketsEur({ min: 89, max: 250, currency: "EUR" }, 2, DEFAULT_SETTINGS)).toBe(178);
    expect(ticketsEur({ min: 50, currency: "GBP" }, 2, { ...DEFAULT_SETTINGS, rates: { EUR: 1, GBP: 0.8 } })).toBe(125);
    expect(ticketsEur(undefined, 2, DEFAULT_SETTINGS)).toBe(0);
    expect(ticketsEur({ min: 50, currency: "XYZ" }, 2, DEFAULT_SETTINGS)).toBeNull();
    expect(planTotal({ total: 200 }, stay("Hotel", 100), 178)).toBe(478);
  });
  it("Fremdwährung ohne Kurs: nicht 1 : 1, sondern zum Nachtragen in Euro", () => {
    const tr = trip();
    tr.event = { name: "Spiel", start: "2027-05-15T15:30", price: { min: 50, max: 90, currency: "XYZ" } };
    take(tr);
    const o = tr.items.find(i => i.cat === "attractions")!.options[0];
    expect(o).toMatchObject({ estimate: true, price: { currency: "EUR", adult: 0 } });
    expect(o.detail).toContain("XYZ");
    expect(o.detail).toContain("manuell");
  });
});
