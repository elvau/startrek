/*
 * Use Cases für Anzeige und Hinweise: Zeitspannen, Reisenamen, Pass-Gültigkeit, Übersicht, Transfer vom Flughafen.
 */
import { describe, expect, it } from "vitest";
import { autoName, duration, flagOf, minutesText, nights, range, shiftLocal } from "./format";
import { validUntil } from "./borders";
import { isBooked, planState, summarize } from "./overview";
import { transferChoices } from "./transit";
import { eurPP, money, moneyExact } from "./calc";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";

const trip = (x: Partial<Trip> = {}): Trip => ({ id: "t", name: "T", place: "Split", country: "HR", travelers: [{ id: "a", name: "A", age: 30, household: "A" }, { id: "b", name: "B", age: 30, household: "B" }], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, ...x });
const it_ = (cat: Item["cat"], status: Item["status"], x: Partial<Item> = {}): Item => ({ id: cat + status, cat, name: "", status, options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 100 } }], ...x });

describe("Zeitspannen und Namen", () => {
  it("Nächte, auch verkehrt herum oder ohne Datum", () => {
    expect(nights("2027-07-01", "2027-07-08")).toBe(7);
    expect(nights("2027-07-08", "2027-07-01")).toBe(0);
    expect(nights(undefined, "2027-07-01")).toBe(0);
    expect(nights("2027-03-27", "2027-03-29")).toBe(2); // Sommerzeit
  });
  it("Zeitraum auf Deutsch, auch über den Monat", () => {
    expect(range("2027-07-18", "2027-07-29")).toBe("18. bis 29. Juli");
    expect(range("2027-07-28", "2027-08-03")).toBe("28. Juli bis 3. August");
  });
  it("Zeitraum über ein Jahr hinweg nennt nicht nur den Monat (gleicher Monat, anderes Jahr) (#505)", () => {
    expect(range("2027-07-18", "2028-07-29")).not.toBe("18. bis 29. Juli");
  });
  it("Reisename aus Ziel und Zeitraum", () => {
    expect(autoName({ place: "Mosel", from: "2027-07-01", to: "2027-07-04" })).toBe("Mosel · Juli 2027 · 4 Tage");
    expect(autoName({ place: "  " })).toBeNull();
    expect(autoName({ place: "Mosel" })).toBe("Mosel");
  });
  it("Dauer und Minuten", () => {
    expect(minutesText(135)).toBe("2 h 15 min");
    expect(minutesText(120)).toBe("2 h");
    expect(minutesText(0)).toBe("");
    expect(minutesText(-5)).toBe("");
    expect(duration("2027-07-01T06:00", "2027-07-01T08:30")).toBe("2 h 30 min");
  });
  it("Ortszeit verschieben über Mitternacht und Monatsende", () => {
    expect(shiftLocal("2027-07-31T23:30", 2)).toBe("2027-08-01T01:30");
    expect(shiftLocal("2027-01-01T01:00", -3)).toBe("2026-12-31T22:00");
  });
  it("Flaggen nur für gültige Ländercodes", () => {
    expect(flagOf("DE")).toBe("🇩🇪");
    expect(flagOf("de")).toBe("");
    expect(flagOf("DEU")).toBe("");
  });
});

describe("Beträge", () => {
  it("gerundet deutsch, Cent nur unter 100 € und wenn nötig", () => {
    expect(money(1505.4, "EUR")).toBe("1.505 €");
    expect(money(NaN, "EUR")).toBe("0 €");
    expect(eurPP(20 / 3)).toBe("6,67 €");
    expect(eurPP(7)).toBe("7 €");
    expect(eurPP(250.4)).toBe("250 €");
    expect(moneyExact(2.8, "EUR")).toMatch(/2,80/);
  });
  it("unbekannter Währungscode stürzt nicht ab", () => {
    expect(money(12, "XYZ1")).toBe("12 XYZ1");
  });
  it("negative Beträge (Guthaben)", () => {
    expect(money(-1505, "EUR")).toBe("-1.505 €");
    expect(eurPP(-20 / 3)).toBe("-6,67 €");
  });
});

describe("Pass-Gültigkeit", () => {
  it("6 Monate ab Einreise", () => {
    expect(validUntil({ months: 6, from: "entry" }, "2027-03-01", "2027-03-15")).toBe("2027-09-01");
  });
  it("Rückreise nach der Frist: bis zur Rückreise", () => {
    expect(validUntil({ days: 30, from: "entry" }, "2027-03-01", "2027-06-01")).toBe("2027-06-01");
  });
  it("Monatsende: 31. August + 6 Monate ist Ende Februar, nicht März (#504)", () => {
    expect(validUntil({ months: 6, from: "entry" }, "2027-08-31", "2027-09-10")).toBe("2028-02-29");
  });
});

describe("Übersicht der Reise", () => {
  it("Stand der Planung", () => {
    expect(planState(trip(), "flights")).toBe("none");
    expect(planState(trip({ simple: { flights: 300 } }), "flights")).toBe("planned");
    expect(planState(trip({ items: [it_("flights", "booked"), it_("flights", "dropped")] }), "flights")).toBe("booked");
    expect(planState(trip({ items: [it_("flights", "booked"), it_("flights", "idea")] }), "flights")).toBe("planned");
  });
  it("gebucht nur, wenn Flug und Unterkunft fest sind; automatische Posten zählen nicht", () => {
    expect(isBooked(trip())).toBe(false);
    expect(isBooked(trip({ items: [it_("flights", "booked"), it_("stay", "paid")] }))).toBe(true);
    expect(isBooked(trip({ items: [it_("flights", "booked"), it_("stay", "idea", { auto: "food" })] }))).toBe(true);
  });
  it("vergangen, gebucht oder geplant", () => {
    const s = (x: Partial<Trip>) => summarize(trip(x), "2027-08-01").state;
    expect(s({ from: "2027-07-01", to: "2027-07-10" })).toBe("past");
    expect(s({ from: "2027-08-01", to: "2027-08-10" })).toBe("planned");
    expect(s({ from: "2027-07-31" })).toBe("past");
    expect(s({ items: [it_("flights", "booked")] })).toBe("booked");
  });
  it("Eigenanteil pro Person, ohne Reisende 0", () => {
    expect(summarize(trip({ items: [it_("misc", "idea")] }), "2027-01-01").perPerson).toBe(50);
    expect(summarize(trip({ travelers: [], items: [it_("misc", "idea")] }), "2027-01-01").perPerson).toBe(0);
  });
  it("Ziel aus Ort und Land", () => {
    expect(summarize(trip(), "2027-01-01").where).toBe("Split, HR");
    expect(summarize(trip({ place: "", country: "" }), "2027-01-01").where).toBe("");
  });
});

describe("Transfer vom Flughafen", () => {
  it("bekannte Bahn und Bus, günstigste zuerst, Taxi zuletzt", () => {
    const l = transferChoices("BCN", 15, { adults: 2, children: 2 }, 60);
    expect(l.map(x => x.k)).toEqual(["rail", "bus", "taxi"]);
    expect(l[0].perRide).toBe(15);
  });
  it("zu weit draußen: nur Taxi", () => {
    expect(transferChoices("BCN", 100, { adults: 2, children: 0 }, 150).map(x => x.k)).toEqual(["taxi"]);
  });
  it("unbekannter Flughafen: Schätzung, mindestens 1 €", () => {
    const l = transferChoices("XXX", 0, { adults: 1, children: 0 }, 30);
    expect(l[0]).toMatchObject({ k: "public", guess: true, adult: 2 });
  });
  it("Gratis-Linie bleibt gratis", () => {
    expect(transferChoices("GVA", 5, { adults: 4, children: 0 }, 40)[0].perRide).toBe(0);
  });
});
