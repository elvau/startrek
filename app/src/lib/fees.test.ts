import { describe, expect, it } from "vitest";
import { CITY_TAXES, TIPS, TOLLS, VIGNETTES, cityTaxFor, roadCosts, roadExtras, routeCountries } from "./fees";
import { DEFAULT_SETTINGS, type Item, type Trip } from "./model";

const trip = (place: string): Trip => ({ id: "t", name: "", place, country: "", tiers: {}, settings: DEFAULT_SETTINGS, travelers: [], items: [] });
const stay = (place: string, label = "Hotel"): Item => ({ id: "s", cat: "stay", name: "Unterkunft", status: "idea",
  options: [{ id: "o", label, price: { mode: "unit", currency: "EUR", unit: 100 }, query: { place, checkin: "2027-05-01", checkout: "2027-05-03", adults: 2, childAges: [], rooms: 1 } }] });

describe("Gepflegte Nebenkosten", () => {
  it("mindestens 30 Städte, jede mit Quelle; Codes und Währungen sauber", () => {
    expect(CITY_TAXES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CITY_TAXES.map(c => c.id)).size).toBe(CITY_TAXES.length);
    expect(CITY_TAXES.every(c => c.source && /^[A-Z]{3}$/.test(c.currency) && c.amount > 0)).toBe(true);
    expect(VIGNETTES.every(v => /^[A-Z]{2}$/.test(v.cc) && v.amount > 0)).toBe(true);
    expect(Object.keys(TOLLS).every(c => /^[A-Z]{2}$/.test(c))).toBe(true);
  });

  it("Ort der Unterkunft erkannt: Suchort vor dem Ziel der Reise, Schreibweisen", () => {
    expect(cityTaxFor(stay("Roma"), stay("Roma").options[0], trip("Italien"))?.id).toBe("rome");
    expect(cityTaxFor(stay("Wien"), stay("Wien").options[0], trip("Paris"))?.id).toBe("vienna");
    expect(cityTaxFor(stay("Palma"), stay("Palma").options[0], trip(""))?.id).toBe("balearics");
    expect(cityTaxFor(stay("Kraków"), stay("Kraków").options[0], trip(""))?.id).toBe("krakow");
    // „Split“ als Ort, aber nicht im Wort „Splitter“; Rom nicht in „Romantik“
    expect(cityTaxFor(stay("Splitterhof"), stay("Splitterhof").options[0], trip(""))).toBeNull();
    expect(cityTaxFor(stay("Romantikhotel Harz"), stay("Romantikhotel Harz").options[0], trip(""))).toBeNull();
    const flight: Item = { ...stay("Rom"), cat: "flights" };
    expect(cityTaxFor(flight, flight.options[0], trip("Rom"))).toBeNull();
  });

  it("Strecke mit dem Auto: Durchfahrten, Vignetten und Mautländer", () => {
    expect(routeCountries("DE", "HR")).toEqual(["AT", "SI", "HR"]);
    expect(routeCountries("DE", "DE")).toEqual([]);
    expect(routeCountries("DE", "FR")).toEqual(["FR"]);
    const r = roadCosts(routeCountries("DE", "HR"));
    expect(r.vignettes.map(v => v.cc)).toEqual(["AT", "SI"]);
    expect(r.tolls).toEqual(["HR"]);
    expect(roadCosts(routeCountries("DE", "ES")).tolls).toEqual(["FR", "ES"]);
  });

  it("Trinkgeld: USA hoch, Japan nicht üblich", () => {
    expect(TIPS.US.norm).toBe("high");
    expect(TIPS.JP.norm).toBe("none");
  });

  it("Auto-Posten: Vignetten je Auto, Maut aus dem Anteil der Strecke im Land, in Euro", () => {
    const x = roadExtras(routeCountries("DE", "HR"), 1500, c => (c === "EUR" ? 1 : 1));
    expect(x.map(e => [e.kind, e.cc, e.amount, e.basis])).toEqual([["vignette", "AT", 12.8, "booking"], ["vignette", "SI", 16, "booking"], ["toll", "HR", 52.5, "booking"]]);
    expect(x.every(e => e.est && e.pay === "onsite" && e.source)).toBe(true);
    // Schweiz in Franken, umgerechnet
    expect(roadExtras(["CH"], 300, c => (c === "CHF" ? 0.8 : 1))[0].amount).toBe(50);
    expect(roadExtras([], 300, () => 1)).toEqual([]);
  });
});
