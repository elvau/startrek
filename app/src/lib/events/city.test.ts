import { describe, expect, it } from "vitest";
import { cityFromAddress } from "./app";
import type { AirportData } from "../geo/locations";
import type { GeoData } from "../geo/places";
// echte Daten der Seite (public/): Flughafenliste, Weltdaten, Orte je Land (DE: p1, GB/IT: pb, FR: pc, ES: pe)
import airports from "../../../../public/airports.json";
import world from "../../../../public/world.json";
import packs from "../../../../public/packs.json";
import p1 from "../../../../public/places/p1.json";
import pb from "../../../../public/places/pb.json";
import pc from "../../../../public/places/pc.json";
import pe from "../../../../public/places/pe.json";

describe("Stadt aus der Stadion-Anschrift (football-data.org)", () => {
  const d = airports as unknown as AirportData;
  const g = { world: world.countries, packs, places: { ...p1, ...pb, ...pc, ...pe } } as unknown as GeoData;

  it.each([
    ["75 Drayton Park London N5 1BU", "GB", "London"],
    ["Sir Matt Busby Way Manchester M16 0RA", "GB", "Manchester"],
    ["Strobelallee 50 Dortmund 44139", "DE", "Dortmund"],
    ["Säbener Str. 51-57 München 81547", "DE", "München"],
    ["Avenida de Concha Espina, 1 Madrid 28036", "ES", "Madrid"],
    ["24, rue du Commandant Guilbaud Paris 75016", "FR", "Paris"],
    // Städte ohne Flughafen: aus den Ortsdaten
    ["Hennes-Weisweiler-Allee 1 Mönchengladbach 41179", "DE", "Mönchengladbach"],
    ["Werner-Seelenbinder-Str. 1 Leipzig 04347", "DE", "Leipzig"]
  ])("%s → %s", (address, cc, city) => {
    expect(cityFromAddress(d, address, cc, g)).toBe(city);
  });

  it("ohne Treffer: leer, damit man die Stadt selbst einträgt", () => {
    expect(cityFromAddress(d, "Musterweg 1 12345", "DE", g)).toBeNull();
  });
});
