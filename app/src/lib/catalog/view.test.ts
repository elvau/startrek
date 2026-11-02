import { describe, expect, it } from "vitest";
import { seedCatalog } from "./seed";
import { catalogBands, cardOf, costRows, lenOf, matches, routeOf, whoOf, type Origin } from "./view";
import { corePP, type CatalogEntry } from "./types";

const KOELN: Origin = { lat: 50.94, lon: 6.96, cc: "DE", name: "Köln" };
const ZUERICH: Origin = { lat: 47.37, lon: 8.54, cc: "CH", name: "Zürich" };
const all = seedCatalog();
const bySlug = (s: string) => all.find(e => e.slug === s)!;

describe("Katalog ansehen (#646)", () => {
  it("Wer reist und Dauer", () => {
    expect(whoOf({ adults: 1, children: 0, infants: 0 })).toBe("solo");
    expect(whoOf({ adults: 2, children: 0, infants: 0 })).toBe("pair");
    expect(whoOf({ adults: 2, children: 1, infants: 0 })).toBe("family");
    expect(whoOf({ adults: 8, children: 0, infants: 0 })).toBe("group");
    expect([3, 5, 7, 12].map(lenOf)).toEqual(["short", "mid", "week", "long"]);
  });
  it("Karte: Preis = Ziel + Anreise, Route ab dem Wohnort mit Verkehrsmittel", () => {
    const c = cardOf(bySlug("gruppenreise-mallorca-kosten"), KOELN);
    expect(c.pp).toBe(corePP(c.e) + 220);
    expect(c.band).toBe("short");
    expect(c.route).toEqual([{ cc: "DE", name: "Köln", home: true }, { cc: "ES", name: "Mallorca", nights: 5, by: "plane" }]);
    expect(cardOf(bySlug("gruppenreise-amsterdam-kosten"), KOELN).route[1].by).toBe("train");
    expect(cardOf(bySlug("gardasee-mehrere-familien-kosten"), KOELN).route[1].by).toBe("train");
  });
  it("ohne Startort: kein Anreisepreis, keine Bänder, nach Titel", () => {
    const b = catalogBands(all, null);
    expect(b).toHaveLength(1);
    expect(b[0].band).toBeNull();
    expect(b[0].cards[0].arrival).toBeNull();
    expect(b[0].cards[0].route[0].home).toBeUndefined();
  });
  it("Bänder nach Entfernung, ab Zürich anders als ab Köln", () => {
    const k = catalogBands(all, KOELN), z = catalogBands(all, ZUERICH);
    expect(k.map(b => b.band)).toEqual(["near", "short"]);
    const first = (bs: typeof k) => bs[0].cards[0].e.slug;
    expect(first(k)).toBe("festival-mit-freunden-kosten");
    expect(first(z)).not.toBe(first(k));
    const zSlugs = z.flatMap(b => b.cards.map(c => c.e.slug));
    expect(zSlugs.indexOf("gardasee-mehrere-familien-kosten")).toBeLessThan(zSlugs.indexOf("ferienhaus-daenemark-familien-kosten"));
  });
  it("Filter: wer reist, Art, Monat, Dauer, Budget", () => {
    const n = (f: Parameters<typeof catalogBands>[2]) => catalogBands(all, KOELN, f).flatMap(b => b.cards).length;
    expect(n({ who: ["family"] })).toBe(3);
    expect(n({ kind: ["event"] })).toBe(3);
    expect(n({ month: 1 })).toBe(1);
    expect(n({ len: ["week"] })).toBe(4);
    expect(n({ budget: 600 })).toBeGreaterThan(0);
    expect(catalogBands(all, KOELN, { budget: 600 }).flatMap(b => b.cards).every(c => c.pp <= 600)).toBe(true);
    const c = cardOf(bySlug("skiurlaub-gruppe-oesterreich-kosten"), KOELN);
    expect(matches(c, { month: 7 })).toBe(false);
  });
  it("Reisemonat im Filter rechnet die Saison der Anreise", () => {
    const e = bySlug("gruppenreise-mallorca-kosten");
    expect(catalogBands([e], KOELN, { month: 6 })[0].cards[0].arrival!.peak).toBe(false);
    const sum = { ...e, months: [7] } as CatalogEntry;
    expect(catalogBands([sum], KOELN, { month: 7 })[0].cards[0].arrival!.peak).toBe(true);
  });
  it("Route mit Stationen, Rückweg und Kreuzfahrt", () => {
    const e: CatalogEntry = { ...bySlug("gruppenreise-mallorca-kosten"), kind: "cruise",
      stops: [{ place: "Miami", cc: "US", lat: 25.77, lon: -80.19, nights: 2 }, { place: "Nassau", cc: "BS", lat: 25.05, lon: -77.35, nights: 1, by: "ship" }, { place: "Miami", cc: "US", lat: 25.77, lon: -80.19, nights: 0, by: "ship" }] };
    const c = cardOf(e, KOELN);
    expect(c.route.map(r => r.by)).toEqual([undefined, "plane", "ship", "ship"]);
    expect(routeOf(e, KOELN, c.arrival, true).at(-1)).toEqual({ cc: "DE", name: "Köln", home: true, by: "plane" });
  });
  it("Kostenzeilen: Anreise geschätzt, Unterkunft, vor Ort, Verpflegung, Sonstiges; Summe = Kartenpreis", () => {
    const c = cardOf(bySlug("gruppenreise-mallorca-kosten"), KOELN);
    const rows = costRows(c.e, c.arrival);
    expect(rows.map(r => r.key)).toEqual(["arrival", "stay", "local", "food", "other"]);
    expect(rows[0].est).toBe(true);
    expect(Math.abs(rows.reduce((a, r) => a + r.pp, 0) - c.pp)).toBeLessThanOrEqual(2);
    const ski = costRows(bySlug("skiurlaub-gruppe-oesterreich-kosten"), null);
    expect(ski.find(r => r.key === "core")!.labels).toEqual(["Skipass 6 Tage"]);
    expect(ski.find(r => r.key === "food")!.labels).toEqual(["Essen, Hütten und Après-Ski"]);
  });
});
