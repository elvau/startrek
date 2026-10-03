import { describe, expect, it } from "vitest";
import { adviceLevel, adviceUrl, parseAdvice } from "./advice";

// Aufbau wie die OpenData-Schnittstelle (gekürzt)
const sample = { response: { lastModified: 1790000000, contentList: ["199124", "223232", "206054"],
  "199124": { lastModified: 1789000000, title: "Afghanistan: Reisewarnung", countryCode: "AF", iso3CountryCode: "AFG", countryName: "Afghanistan", warning: true, partialWarning: false, situationWarning: false, situationPartWarning: false },
  "223232": { lastModified: 1786500000, title: "Ecuador", countryCode: "EC", iso3CountryCode: "ECU", countryName: "Ecuador", warning: false, partialWarning: false, situationWarning: false, situationPartWarning: true },
  "206054": { countryCode: "KP", countryName: "Nordkorea", warning: true } } };

describe("Hinweise des Auswärtigen Amts", () => {
  it("je Land: Warnstufe, Name, Stand, Link", () => {
    const m = parseAdvice(sample);
    expect(Object.keys(m).sort()).toEqual(["AF", "EC", "KP"]);
    expect(adviceLevel(m.AF)).toBe("warning");
    expect(adviceLevel(m.EC)).toBe("situation");
    expect(m.EC.modified).toBe("2026-08-12");
    expect(adviceUrl(m.EC)).toBe("https://www.auswaertiges-amt.de/de/ReiseUndSicherheit/223232");
    expect(parseAdvice(null)).toEqual({});
    expect(parseAdvice({ response: {} })).toEqual({});
  });
});
