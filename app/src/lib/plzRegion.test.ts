import { describe, expect, it } from "vitest";
import { householdRegion, regionFromPlz } from "./plzRegion";

describe("Ferien-Region aus der PLZ (#570)", () => {
  it("überwiegendes Bundesland, eindeutige Bereiche ohne Prüfhinweis", () => {
    expect(regionFromPlz("DE", "44787")).toEqual({ region: "DE-NW", check: false });
    expect(regionFromPlz(undefined, "80331")).toEqual({ region: "DE-BY", check: false });
    expect(regionFromPlz("DE", "10115")).toEqual({ region: "DE-BE", check: false });
    expect(regionFromPlz("DE", "01067")).toEqual({ region: "DE-SN", check: false });
  });
  it("Mischgebiete: verfeinert und „bitte prüfen“", () => {
    expect(regionFromPlz("DE", "22844")).toEqual({ region: "DE-SH", check: true }); // Norderstedt
    expect(regionFromPlz("DE", "27568")).toEqual({ region: "DE-HB", check: true }); // Bremerhaven
    expect(regionFromPlz("DE", "89231")).toEqual({ region: "DE-BY", check: true }); // Neu-Ulm
    expect(regionFromPlz("DE", "63739")).toEqual({ region: "DE-BY", check: true }); // Aschaffenburg
    expect(regionFromPlz("DE", "68519")).toEqual({ region: "DE-HE", check: true }); // Viernheim
    expect(regionFromPlz("DE", "96515")).toEqual({ region: "DE-TH", check: true }); // Sonneberg
  });
  it("andere Länder: ganzes Land; Unvollständiges: nichts", () => {
    expect(regionFromPlz("AT", "1010")).toEqual({ region: "AT-", check: false });
    expect(regionFromPlz("DE", "447")).toBeUndefined();
    expect(regionFromPlz("DE", "")).toBeUndefined();
  });
  it("Familie: selbst gewählt gewinnt, sonst geschätzt", () => {
    expect(householdRegion({ region: "DE-NI", plz: "44787" })).toEqual({ region: "DE-NI", check: false, guessed: false });
    expect(householdRegion({ plz: "44787" })).toEqual({ region: "DE-NW", check: false, guessed: true });
    expect(householdRegion(undefined)).toBeUndefined();
  });
});
