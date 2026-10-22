import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncTips } from "../fees";
import { DEFAULT_SETTINGS, type Port, type Trip } from "../model";
import type { GeoData } from "../geo/places";
import { newCruise } from "../cruise";
import { column } from "../compareView";
import { cruiseToLand, HOTEL_DE, landCities, SEA_LEG, tripFacts } from "./land";

beforeAll(() => syncTips(false));
afterAll(() => syncTips(true));

const G = {
  world: [
    { k: "ES", l: "Spanien", en: "Spain", pli: 0.9, cities: [["Barcelona", 41.39, 2.17]] },
    { k: "IT", l: "Italien", en: "Italy", pli: 1, cities: [["Rom", 41.9, 12.5], ["Genua", 44.41, 8.93]] },
    { k: "FR", l: "Frankreich", en: "France", pli: 1.1, cities: [["Marseille", 43.3, 5.37]] }
  ],
  packs: {}, places: { IT: [["Livorno", 43.55, 10.31], ["Palermo", 38.12, 13.36]] }
} as unknown as GeoData;

const ROUTE: Port[] = [
  { date: "2027-05-10", place: "Barcelona", dep: "18:00" }, { date: "2027-05-11", place: "Marseille", arr: "08:00", dep: "18:00" },
  { date: "2027-05-12", place: "Livorno", arr: "07:00", dep: "19:00" }, { date: "2027-05-13", place: "Rom", arr: "07:00", dep: "19:00" },
  { date: "2027-05-14", sea: true }, { date: "2027-05-15", place: "Palermo", arr: "08:00", dep: "16:00" }, { date: "2027-05-17", place: "Barcelona", arr: "07:00" }
];

const trip = (): Trip => ({ id: "t", name: "Mittelmeer", place: "Barcelona", country: "ES", items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, from: "2027-05-10", to: "2027-05-17",
  travelers: [{ id: "a", name: "A", household: "X" }, { id: "b", name: "B", household: "X" }, { id: "c", name: "C", household: "Y" }] });

describe("Kreuzfahrt gegen Rundreise an Land (#520)", () => {
  it("bis zu 3 Städte: Hafen der Einschiffung, bekannte Städte dazwischen, Nächte verteilt", () => {
    const c = landCities(ROUTE, G);
    expect(c.map(x => [x.name, x.from, x.to])).toEqual([["Barcelona", "2027-05-10", "2027-05-13"], ["Marseille", "2027-05-13", "2027-05-15"], ["Rom", "2027-05-15", "2027-05-17"]]);
    expect(landCities([{ date: "2027-05-10", place: "Kiel" }], G)).toEqual([]);
  });
  it("Variante: Kreuzfahrt ersetzt durch Hotels je Stadt und Fahrten, zurück zum Hafen; Vergleich mit Zielen und Fahrzeit", () => {
    const tr = trip();
    const cr = newCruise(tr, "EUR");
    cr.cruise!.ports = ROUTE;
    tr.items.push(cr);
    tr.detail = { stay: true };
    expect(tripFacts(tr)).toEqual({ places: 5, hours: 0, cruise: true });
    const cities = cruiseToLand(tr, cr.id, G);
    expect(cities.length).toBe(3);
    expect(tr.items.some(i => i.cruise)).toBe(false);
    const stays = tr.items.filter(i => i.hint === "land:stay"), legs = tr.items.filter(i => i.hint?.startsWith("land:leg"));
    expect(stays.map(i => i.options[0].query?.place)).toEqual(["Barcelona", "Marseille", "Rom"]);
    // 2 Zimmer (Familie X und Y) × Richtwert nach Preisniveau
    expect(stays[0].options[0].price).toMatchObject({ basis: "night", unit: 2 * Math.round(HOTEL_DE * Math.pow(0.9, 0.8)) });
    expect(stays[0].options[0].query).toMatchObject({ checkin: "2027-05-10", checkout: "2027-05-13", adults: 3, rooms: 2 });
    expect(legs.map(i => i.name)).toEqual(["Barcelona → Marseille", "Marseille → Rom", "Rom → Barcelona"]);
    expect(legs.every(i => i.options[0].estimate && (i.options[0].price.adult || 0) > 0)).toBe(true);
    const f = tripFacts(tr)!;
    expect(f.places).toBe(3);
    expect(f.hours).toBeGreaterThan(10);
    expect(column(tr).facts).toEqual(f);
  });
  it("Insel ohne Landweg: Fähre oder Flug als Richtwert", () => {
    const tr = trip();
    const cr = newCruise(tr, "EUR");
    cr.cruise!.ports = [{ date: "2027-05-10", place: "Barcelona" }, { date: "2027-05-12", place: "Palermo" }, { date: "2027-05-14", place: "Barcelona" }];
    tr.items.push(cr);
    cruiseToLand(tr, cr.id, G);
    const leg = tr.items.find(i => i.name === "Barcelona → Palermo")!;
    expect(leg.options[0].price.adult).toBe(SEA_LEG.pp);
    expect(leg.hint).toBe(`land:leg:${SEA_LEG.hours}`);
  });
});

describe("Verpflegung an Bord (#520)", () => {
  it("Kreuzfahrt zählt als Vollpension", async () => {
    const { boardFor } = await import("../food");
    const tr = trip();
    tr.detail = { stay: true };
    tr.items.push(newCruise(tr, "EUR"));
    expect(boardFor(tr, ["a"])).toBe("full");
  });
});
