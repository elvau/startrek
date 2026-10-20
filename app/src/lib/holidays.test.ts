import { describe, expect, it } from "vitest";
import { calendarMarks, holidayName, holidayPlace, holidayRange, holidaysIn, parseOH, regionName, workdayHolidays } from "./holidays";

// Aufbau wie die Antworten der OpenHolidays API (scripts/regions.mjs --probe)
const school = parseOH([
  { startDate: "2026-12-24", endDate: "2027-01-06", name: [{ language: "DE", text: "Weihnachtsferien" }, { language: "EN", text: "Christmas holidays" }], nationwide: true },
  { startDate: "2027-02-01", endDate: "2027-02-06", name: [{ language: "DE", text: "Semesterferien" }], nationwide: false, subdivisions: [{ code: "AT-NÖ" }, { code: "AT-WI" }] },
  { startDate: "2027-02-08", endDate: "2027-02-13", name: [{ language: "DE", text: "Semesterferien" }], nationwide: false, subdivisions: [{ code: "AT-KÄ" }] },
  { startDate: "kaputt", endDate: "2027-01-01" }
]);
const pub = parseOH([
  { startDate: "2027-10-26", endDate: "2027-10-26", name: [{ language: "DE", text: "Nationalfeiertag" }], nationwide: true },
  { startDate: "2027-10-30", endDate: "2027-10-30", name: [{ language: "DE", text: "Samstag-Feiertag" }], nationwide: true }
]);

describe("Schulferien und Feiertage (#163)", () => {
  it("liest die Antworten, kaputte Einträge fallen weg", () => {
    expect(school).toHaveLength(3);
    expect(school[1]).toEqual({ from: "2027-02-01", to: "2027-02-06", n: { de: "Semesterferien" }, nationwide: false, regions: ["AT-NÖ", "AT-WI"] });
    expect(holidayName(school[0], "en")).toBe("Christmas holidays");
    expect(holidayName(school[0], "pl")).toBe("Christmas holidays");
    expect(holidayName(school[1], "fr")).toBe("Semesterferien");
  });
  it("gespeicherte Angabe: altes Bundesland, Region, ganzes Land", () => {
    expect(holidayPlace("NW")).toEqual({ cc: "DE", region: "DE-NW" });
    expect(holidayPlace("AT-WI")).toEqual({ cc: "AT", region: "AT-WI" });
    expect(holidayPlace("BE-")).toEqual({ cc: "BE" });
    expect(holidayPlace(undefined)).toBeUndefined();
  });
  it("Ferien in Wien im Zeitraum, nach Datum", () => {
    expect(holidaysIn(school, "2027-01-01", "2027-03-01", "AT-WI").map(h => h.from)).toEqual(["2026-12-24", "2027-02-01"]);
    expect(holidaysIn(school, "2027-01-10", "2027-03-01", "AT-KÄ").map(h => h.from)).toEqual(["2027-02-08"]);
    // ohne Region: alle
    expect(holidaysIn(school, "2027-01-10", "2027-03-01")).toHaveLength(2);
  });
  it("Feiertage an Werktagen während der Reise (Samstag zählt nicht)", () => {
    expect(workdayHolidays(pub, "2027-10-24", "2027-10-31").map(h => h.from)).toEqual(["2027-10-26"]);
  });
  it("Zeitraum und Regionsname", () => {
    expect(holidayRange("2026-10-13")).toEqual({ from: "2026-01-01", to: "2027-12-31" });
    const rs = { countries: { AT: [{ code: "AT-WI", n: { de: "Wien", en: "Vienna" } }] } };
    expect(regionName(rs, "AT-WI", "en")).toBe("Vienna");
    expect(regionName(rs, "AT-WI", "ru")).toBe("Vienna");
    expect(regionName(rs, "AT-XX", "de")).toBe("AT-XX");
  });
});

describe("Markierungen im Kalender (#377)", () => {
  const data = { school, public: pub };
  it("mit Region: Feiertage und Schulferien dieser Region, jeder Tag eines Zeitraums", () => {
    const m = calendarMarks(data, "AT-WI", "de");
    expect(m["2027-10-26"].pub).toBe("Nationalfeiertag");
    expect(m["2027-02-01"].school).toBe("Semesterferien");
    expect(m["2027-02-06"].school).toBe("Semesterferien");
    expect(m["2027-02-08"]).toBeUndefined();
    expect(m["2026-12-31"].school).toBe("Weihnachtsferien");
  });
  it("ohne Region: nur landesweite Feiertage, keine Schulferien", () => {
    const m = calendarMarks(data, undefined, "en");
    expect(m["2027-10-26"].pub).toBeTruthy();
    expect(Object.values(m).some(x => x.school)).toBe(false);
    expect(Object.values(m).every(x => x.pub)).toBe(true);
  });
});
