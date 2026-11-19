import { describe, expect, it } from "vitest";
import world from "../../../../public/world.json";
import packs from "../../../../public/packs.json";
import places from "../../../../public/places/pa.json";
import placesPe from "../../../../public/places/pe.json";
import placesDe from "../../../../public/places/p1.json";
import plzTxt from "../../../public/plz.txt?raw";
import { airportOf, capitalOf, ccOf, cityForAirport, findCity, kmBetween, placesNear, resolvePlace, searchParts, suggestCities, type GeoData, type PostalRow } from "./places";

// echte Daten des Artefakts (public/ im Hauptordner)
const g = { world: world.countries, packs, places } as unknown as GeoData;
const ge = { world: world.countries, packs, places: { ...places, ...placesPe } } as unknown as GeoData;

describe("Orte und Flughäfen", () => {
  it("Hauptstadt eines Landes (Event nur mit Land, z. B. Sabah FK)", () => {
    expect(capitalOf(g, "AZ")).toMatchObject({ name: "Baku" });
    expect(capitalOf(g, "XX")).toBeNull();
  });

  it("findet Flughäfen aus Paketen und Weltdaten", () => {
    expect(airportOf(g, "SPU")).toMatchObject({ code: "SPU", cc: "HR", name: "Split" });
    expect(airportOf(g, "zag")?.cc).toBe("HR");
    expect(airportOf(g, "XXX")).toBeNull();
  });
  it("Land aus deutschem oder englischem Namen", () => {
    expect(ccOf(g, "Kroatien")).toBe("HR");
    expect(ccOf(g, "Croatia")).toBe("HR");
    expect(ccOf(g, "")).toBeNull();
  });
  it("Land auch aus Namen in den anderen Sprachen der App", () => {
    expect(["Croacia", "Croatie", "Chorwacja", "Хорватия"].map(n => ccOf(g, n))).toEqual(["HR", "HR", "HR", "HR"]);
    expect(ccOf(g, "Atlantis")).toBeNull();
  });
  it("Orte am Flughafen Split, nächste zuerst, höchstens 40 km", () => {
    const l = placesNear(g, airportOf(g, "SPU")!, 5);
    expect(l.length).toBeGreaterThan(2);
    expect(l.every(p => p.km <= 40)).toBe(true);
    expect(l.map(p => p.km)).toEqual([...l.map(p => p.km)].sort((a, b) => a - b));
    expect(l.map(p => p.name)).toContain("Trogir");
  });
  it("Ort für einen Flughafen wie im Artefakt (größere Orte zählen näher)", () => {
    expect(["Split", "Trogir"]).toContain(cityForAirport(g, airportOf(g, "SPU")!)?.name);
  });
  it("Suchbegriff auf Englisch: Ort und Land", () => {
    expect(findCity(g, "Plitvice", "HR")?.name).toBe("Plitvicer Seen");
    expect(searchParts(g, "Plitvicer Seen", "HR")).toEqual({ place: "Plitvice Lakes", country: "Croatia" });
    expect(searchParts(g, "Trogir", "HR")).toEqual({ place: "Trogir", country: "Croatia" });
    expect(searchParts(g, "Irgendwo, Spain", "HR")).toEqual({ place: "Irgendwo", country: "Spain" });
  });
  it("Cala Ratjada ist ein eigener Ort, Teil nach dem Komma nur als Land (#622)", () => {
    for (const q of ["Cala Ratjada", "Cala Rajada", "Cala Rajada, Capdepera", "Cala Ratjada, Mallorca"]) {
      const c = findCity(ge, q, "ES");
      expect(c, q).toMatchObject({ name: "Cala Rajada", lat: 39.712, lon: 3.463 });
      const sp = searchParts(ge, q, "ES");
      expect(sp, q).toEqual({ place: "Cala Ratjada", country: "Spain" });
    }
    expect(findCity(ge, "Cala Millor", "ES")?.name).toBe("Cala Millor");
    expect(searchParts(ge, "Cala Rajada, Mallorca")).toEqual({ place: "Cala Ratjada", country: "Spain" });
  });
  it("Stadtsuche: deutsch oder englisch, Länder der Reise zuerst, mit Land", () => {
    const cu = suggestCities(g, "Cuz");
    expect(cu[0]).toMatchObject({ name: "Cusco", cc: "PE", land: "Peru", landEn: "Peru" });
    expect(suggestCities(g, "cusco")[0].name).toBe("Cusco");
    // Land der Reise zuerst (dort auch kleinere Orte)
    const tr = suggestCities(g, "Tro", ["HR"]);
    expect(tr[0]).toMatchObject({ name: "Trogir", cc: "HR" });
    expect(suggestCities(g, "x")).toEqual([]);
    expect(suggestCities(g, "Rio de", [], 3).some(h => h.name === "Rio de Janeiro" && h.cc === "BR")).toBe(true);
  });
});

describe("Ort genauer auflösen (#679)", () => {
  const gd = { world: world.countries, packs, places: { DE: placesDe.DE } } as unknown as GeoData;
  // plz.txt wie in worker/src/home.ts gelesen
  const postal: PostalRow[] = plzTxt.split("|").filter((x: string) => x.length > 15)
    .map((x: string): PostalRow => [x.slice(0, 5), x.slice(15), (+x.slice(5, 10) + 47000) / 1000, (+x.slice(10, 15) + 5000) / 1000]);
  const oberpfalz = (r: { lat?: number; lon?: number }) => kmBetween({ lat: r.lat!, lon: r.lon! }, { lat: 49.23, lon: 12.88 }) < 10;

  it("Landkreis, Bundesland oder PLZ wählen unter gleichnamigen Orten (Rimbach im Landkreis Cham, nicht im Odenwald)", () => {
    for (const q of ["Rimbach, Landkreis Cham", "Rimbach, Lkr. Cham", "Rimbach, Bayern", "Rimbach, 93485", "93485 Rimbach", "Rimbach, Landkreis Cham, Germany"]) {
      const r = resolvePlace(gd, q, "DE", postal);
      expect(oberpfalz(r), q).toBe(true);
      expect(r, q).toMatchObject({ place: "Rimbach", country: "Germany", cc: "DE", pinned: true });
      expect(r.others, q).toBeUndefined();
    }
    expect(oberpfalz(resolvePlace(gd, "Rimbach, Hessen", "DE", postal))).toBe(false);
    expect(oberpfalz(resolvePlace(gd, "Rimbach, Odenwald", "DE", postal))).toBe(false);
  });
  it("ohne Zusatz: erster Ort, die gleichnamigen als Hinweis statt stiller Wahl", () => {
    const r = resolvePlace(gd, "Rimbach", "DE", postal);
    expect(r.pinned).toBe(true);
    expect(r.others?.join(" ")).toContain("93485");
    // ohne Land: das Land des bekannten Orts
    expect(resolvePlace(gd, "Rimbach", null, postal).cc).toBe("DE");
  });
  it("eindeutige Orte wie bisher: kein Umkreis, kein Hinweis", () => {
    const r = resolvePlace(gd, "Cham", "DE", postal);
    expect(r).toMatchObject({ place: "Cham", cc: "DE" });
    expect(r.pinned).toBeUndefined();
    // bekannte Stadt mit gleichnamigem Ort: Suche über den Namen bleibt, Hinweis auf den anderen
    const f = resolvePlace(gd, "Fürth", "DE", postal);
    expect(f.place).toBe("Fürth");
    expect(f.lat).toBeCloseTo(49.47, 1);
    expect(f.pinned).toBeUndefined();
    expect(f.others?.length).toBeGreaterThan(0);
    const fo = resolvePlace(gd, "Fürth, Hessen", "DE", postal);
    expect(fo.pinned).toBe(true);
    expect(fo.lat).toBeCloseTo(49.65, 1);
    expect(resolvePlace(g, "Trogir", "HR")).toEqual({ place: "Trogir", country: "Croatia", cc: "HR", lat: expect.any(Number), lon: expect.any(Number) });
    expect(resolvePlace(g, "Irgendwo, Spain", "HR")).toEqual({ place: "Irgendwo", country: "Spain", cc: "ES" });
    expect(resolvePlace(ge, "Cala Rajada, Mallorca", "ES")).toMatchObject({ place: "Cala Ratjada", country: "Spain", lat: 39.712, lon: 3.463 });
  });
  it("Urlaubsregion: Mittelpunkt und Umkreis, Passau und München liegen draußen", () => {
    const r = resolvePlace(gd, "Bayerischer Wald", "DE", postal);
    expect(r).toMatchObject({ place: "Bavarian Forest", country: "Germany", cc: "DE", areaKm: 45 });
    expect(resolvePlace(gd, "Bayerischer Wald", null)).toMatchObject({ areaKm: 45 });
    const c = { lat: r.lat!, lon: r.lon! };
    expect(kmBetween(c, { lat: 48.574, lon: 13.461 })).toBeGreaterThan(r.areaKm!); // Passau
    expect(kmBetween(c, { lat: 48.16, lon: 11.75 })).toBeGreaterThan(r.areaKm!); // Feldkirchen bei München
    expect(kmBetween(c, { lat: 49.07, lon: 13.1 })).toBeLessThan(r.areaKm!); // Bodenmais
  });
});
