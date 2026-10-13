import { describe, expect, it } from "vitest";
import { adviceSource, isoOfName, parseCanada, parseUkCountry, parseUkIndex, parseUsa } from "./govadvice";

describe("Reisehinweise der eigenen Regierung", () => {
  it("Quelle je Staatsangehörigkeit: Deutsch vor allem, sonst eigene Schnittstelle, sonst Auswärtiges Amt mit Hinweis", () => {
    const have = { GB: { level: null, url: "u" }, US: { level: null, url: "u" } };
    expect(adviceSource(["DE"], have)).toEqual({ src: "AA", fallback: false });
    expect(adviceSource(["GB", "DE"], have)).toEqual({ src: "AA", fallback: false });
    expect(adviceSource(["GB"], have)).toEqual({ src: "GB", fallback: false });
    expect(adviceSource(["FR", "US"], have)).toEqual({ src: "US", fallback: false });
    // Kanada ohne Daten für das Land, Österreich ohne Schnittstelle
    expect(adviceSource(["CA"], have)).toEqual({ src: "AA", fallback: true });
    expect(adviceSource(["AT"], undefined)).toEqual({ src: "AA", fallback: true });
  });

  it("Ländernamen der Quellen → ISO-2", () => {
    expect(isoOfName("USA")).toBe("US");
    expect(isoOfName("Germany")).toBe("DE");
    expect(isoOfName("Burma (Myanmar)")).toBe("MM");
    expect(isoOfName("Côte d'Ivoire")).toBe("CI");
    expect(isoOfName("Democratic Republic of the Congo")).toBe("CD");
    expect(isoOfName("Saint Lucia")).toBe("LC");
    expect(isoOfName("Bosnia and Herzegovina")).toBe("BA");
    expect(isoOfName("Atlantis")).toBeUndefined();
  });

  it("Kanada: Stufen 0–3, regionale Warnungen als Teilreisewarnung", () => {
    const m = parseCanada({ metadata: {}, data: {
      AF: { "country-iso": "AF", "advisory-state": 3, "has-regional-advisory": 0, eng: { "url-slug": "afghanistan" }, "date-published": { timestamp: 1759000000 } },
      MX: { "country-iso": "MX", "advisory-state": 1, "has-regional-advisory": 1, eng: { "url-slug": "mexico" } },
      FR: { "country-iso": "FR", "advisory-state": 1, "has-regional-advisory": 0, eng: { "url-slug": "france" } },
      DK: { "country-iso": "DK", "advisory-state": 0, eng: { "url-slug": "denmark" } }
    } });
    expect(m.AF).toMatchObject({ level: "warning", url: "https://travel.gc.ca/destinations/afghanistan", modified: "2025-09-27" });
    expect(m.MX.level).toBe("partial");
    expect(m.FR.level).toBe("situation");
    expect(m.DK.level).toBeNull();
  });

  it("USA: Level aus dem Titel, Land aus dem Namen", () => {
    const m = parseUsa([
      { Title: "Mexico - Level 2: Exercise Increased Caution", Link: "https://travel.state.gov/x/mexico.html", Updated: "2026-09-12T00:00:00-04:00" },
      { Title: "Burma (Myanmar) - Level 4: Do Not Travel", Link: "https://travel.state.gov/x/burma.html" },
      { Title: "Germany - Level 1: Exercise Normal Precautions", Link: "javascript:alert(1)" },
      { Title: "Worldwide Caution" }
    ]);
    expect(m.MX).toEqual({ level: "situation", url: "https://travel.state.gov/x/mexico.html", modified: "2026-09-12" });
    expect(m.MM.level).toBe("warning");
    expect(m.DE.level).toBeNull();
    expect(m.DE.url).toMatch(/^https:\/\/travel\.state\.gov\//);
    expect(Object.keys(m).sort()).toEqual(["DE", "MM", "MX"]);
  });

  it("Großbritannien: Liste mit slug, je Land alert_status", () => {
    expect(parseUkIndex({ links: { children: [
      { details: { country: { name: "USA", slug: "usa" } } },
      { details: { country: { name: "France", slug: "france" } } },
      { details: { country: { name: "Böse", slug: "../x" } } }
    ] } })).toEqual({ US: "usa", FR: "france" });
    expect(parseUkCountry({ details: { alert_status: [] }, public_updated_at: "2026-10-01T10:00:00Z" }, "france"))
      .toEqual({ level: null, url: "https://www.gov.uk/foreign-travel-advice/france", embassy: "https://www.gov.uk/world/france", modified: "2026-10-01" });
    expect(parseUkCountry({ details: { alert_status: ["avoid_all_but_essential_travel_to_parts"] } }, "usa").level).toBe("partial");
    expect(parseUkCountry({ details: { alert_status: ["avoid_all_travel_to_whole_country"] } }, "x").level).toBe("warning");
  });
});
