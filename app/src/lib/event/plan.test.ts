import { describe, expect, it } from "vitest";
import { eventDays, fits, fixWindow, km, nearestStay, pickStay, pickStayNear, takePlan, variants } from "./plan";
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
