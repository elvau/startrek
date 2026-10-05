import { describe, expect, it } from "vitest";
import { BOOK_AHEAD, CITIES, bookAheadFor, icsFor, saleFor, zoned } from "./bookahead";
import { HINTS } from "./hints";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { importantPoints, isUrgent } from "./important";

const get = (id: string) => BOOK_AHEAD.find(e => e.id === id)!;

describe("Früh buchen: Verkaufsstart", () => {
  it("Ortszeit in Zeitpunkt: Tokio ohne, Rom mit Sommerzeit", () => {
    expect(zoned("2027-03-01", "00:00", "Asia/Tokyo").toISOString()).toBe("2027-02-28T15:00:00.000Z");
    expect(zoned("2027-07-01", "00:00", "Europe/Rome").toISOString()).toBe("2027-06-30T22:00:00.000Z");
    expect(zoned("2027-01-10", "08:00", "America/Denver").toISOString()).toBe("2027-01-10T15:00:00.000Z");
  });

  it("Fenster: Tage, Monate, monatlich, wöchentlich, jährlich, so früh wie möglich", () => {
    expect(saleFor(get("shibuya-sky"), "2027-03-15")).toMatchObject({ date: "2027-03-01", time: "00:00" });
    expect(saleFor(get("vatican"), "2027-07-01")).toMatchObject({ date: "2027-05-02" });
    expect(saleFor(get("tokyo-disney"), "2027-05-15")).toMatchObject({ date: "2027-03-15", time: "14:00" });
    // gleicher Kalendertag zwei Monate vorher; den 30. Februar gibt es nicht → 1. März
    expect(saleFor(get("tokyo-disney"), "2027-04-30").date).toBe("2027-03-01");
    expect(saleFor(get("ghibli-museum"), "2027-02-14")).toMatchObject({ date: "2027-01-10", time: "10:00" });
    expect(saleFor(get("ghibli-park"), "2027-02-14").date).toBe("2026-12-10");
    // Anne Frank: Dienstag 10:00, sechs Wochen vorher (Besuch Fr 14.05.2027 → Di 30.03.2027)
    expect(saleFor(get("anne-frank"), "2027-05-14")).toMatchObject({ date: "2027-03-30", time: "10:00" });
    expect(saleFor(get("inca-trail"), "2027-05-10")).toMatchObject({ date: "2026-10-01", monthOnly: true });
    expect(saleFor(get("milford-track"), "2027-01-10").date).toBe("2026-05-01");
    expect(saleFor(get("milford-track"), "2027-12-10").date).toBe("2027-05-01");
    expect(saleFor(get("cenacolo"), "2027-06-10")).toEqual({ by: "2027-03-12" });
  });

  it("Katalog: mindestens 60 Orte, jeder mit Reiseziel, Link und gültiger Zeitzone", () => {
    expect(BOOK_AHEAD.length).toBeGreaterThanOrEqual(60);
    expect(new Set(BOOK_AHEAD.map(e => e.id)).size).toBe(BOOK_AHEAD.length);
    for (const e of BOOK_AHEAD) {
      expect(CITIES[e.city], e.id).toBeTruthy();
      expect(e.links[0]?.url, e.id).toMatch(/^https:\/\//);
      expect(() => new Intl.DateTimeFormat("en", { timeZone: e.tz }), e.id).not.toThrow();
      if (e.hint) expect(HINTS.some(h => h.id === e.hint), e.id).toBe(true);
    }
  });

  it("Erkennung über Stichwort bzw. Flughafen, Saison-Orte nur im passenden Monat", () => {
    expect(bookAheadFor("Tokio", new Set()).map(e => e.id)).toContain("shibuya-sky");
    expect(bookAheadFor("", new Set(["NRT"])).map(e => e.city)).toContain("tokyo");
    expect(bookAheadFor("Amsterdam", new Set(), "2027-04-10").map(e => e.id)).toContain("keukenhof");
    expect(bookAheadFor("Amsterdam", new Set(), "2027-08-10").map(e => e.id)).not.toContain("keukenhof");
    expect(bookAheadFor("Rom", new Set()).map(e => e.id)).toEqual(["vatican", "colosseum", "borghese"]);
    expect(bookAheadFor("Romantik am Rhein", new Set())).toEqual([]);
  });
});

describe("Früh buchen unter „Wichtiges“", () => {
  const trip = (from: string, items: Trip["items"] = []): Trip => ({ id: "t", name: "Tokio", place: "Tokio", country: "Japan", from, to: from, tiers: {}, settings: DEFAULT_SETTINGS,
    travelers: [{ id: "a", name: "Anna", household: "Klein" }], items });
  const now = Date.parse("2027-02-20T12:00:00Z");

  it("ein Punkt je Reiseziel, früheste zuerst, bald → aufgeklappt", () => {
    const book = bookAheadFor("Tokio", new Set());
    const [p] = importantPoints({ trip: trip("2027-03-15"), countries: [], hints: [], visa: null, advice: {}, book, now }).filter(x => x.kind === "book");
    expect(p.key).toBe("book:tokyo");
    expect(p.book!.entries[0].e.id).toBe("tokyo-disney");
    expect(p.book!.entries.map(x => x.e.id)).toContain("shibuya-sky");
    expect(p.book!.soon).toBe(true);
    expect(isUrgent(p)).toBe(true);
    const later = importantPoints({ trip: trip("2027-12-15"), countries: [], hints: [], visa: null, advice: {}, book, now }).find(x => x.kind === "book")!;
    expect(later.book!.soon).toBe(false);
  });

  it("gebucht → fällt weg; Hinweis zum gleichen Ort geht im Punkt auf", () => {
    const book = bookAheadFor("Granada Alhambra", new Set());
    const hints = HINTS.filter(h => h.id === "alhambra");
    const open = importantPoints({ trip: trip("2027-06-01"), countries: [], hints, visa: null, advice: {}, book, now });
    expect(open.map(p => p.key)).toEqual(["book:granada"]);
    const done = importantPoints({ trip: trip("2027-06-01", [{ id: "i", cat: "attractions", name: "Alhambra", status: "booked", hint: "alhambra", options: [] }]), countries: [], hints, visa: null, advice: {}, book, now });
    expect(done.some(p => p.kind === "book")).toBe(false);
  });

  it("ohne Reisedatum: Punkt ohne Termine", () => {
    const p = importantPoints({ trip: { ...trip(""), from: undefined }, countries: [], hints: [], visa: null, advice: {}, book: bookAheadFor("Paris", new Set()), now }).find(x => x.kind === "book")!;
    expect(p.book!.entries.every(x => !x.sale.date && !x.sale.by)).toBe(true);
    expect(p.book!.soon).toBe(false);
  });
});

describe("Kalendereintrag", () => {
  it("Verkaufsstart als .ics in UTC mit Erinnerung", () => {
    const e = get("shibuya-sky"), at = saleFor(e, "2027-03-15").at!;
    const ics = icsFor(e, at, "Shibuya Sky: Verkauf startet", new Date("2027-01-01T00:00:00Z"));
    expect(ics).toContain("DTSTART:20270228T150000Z");
    expect(ics).toContain("SUMMARY:Shibuya Sky: Verkauf startet");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
