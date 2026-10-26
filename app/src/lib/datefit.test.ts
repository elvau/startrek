import { describe, expect, it } from "vitest";
import { fits, fittingStarts, usefulDays, defaultCfg, type CalCtx } from "./datefit";
import { addDay } from "./together";

/** Beispiel 2027: 3.10. (So) überall Feiertag, 1.11. (Mo) Allerheiligen nur NRW; Herbstferien NRW 9.–24.10., Niedersachsen 14.–25.10. */
function ctx(kids: string[] = ["DE-NW"]): CalCtx {
  const marks: CalCtx["marks"] = { "DE-NW": {}, "DE-NI": {} };
  const fill = (r: string, from: string, to: string, k: "pub" | "school", n: string) => { for (let d = from; d <= to; d = addDay(d, 1)) (marks[r][d] ||= {})[k] = n; };
  for (const r of ["DE-NW", "DE-NI"]) fill(r, "2027-10-03", "2027-10-03", "pub", "Tag der Deutschen Einheit");
  fill("DE-NW", "2027-11-01", "2027-11-01", "pub", "Allerheiligen");
  fill("DE-NW", "2027-10-09", "2027-10-24", "school", "Herbstferien NRW");
  fill("DE-NI", "2027-10-14", "2027-10-25", "school", "Herbstferien Niedersachsen");
  return { regions: { "DE-NW": ["Sendler", "Bednorz"], "DE-NI": ["Kegler"] }, kidRegions: kids, marks };
}

describe("Welche Tage (#568)", () => {
  it("Wochenenden, 2 Nächte: Fr–So passt ohne Urlaub, Mo–Mi nicht", () => {
    const c = ctx();
    const we = { days: "weekend" as const };
    expect(fits("2027-09-17", "2027-09-19", we, c)).toMatchObject({ ok: true, vac: {} });
    expect(fits("2027-09-20", "2027-09-22", we, c).ok).toBe(false);
    // Anreise Freitag zählt nicht als Arbeitstag, Sonntag ist Feiertag: trotzdem nur 2 Nächte
    expect(fits("2027-10-01", "2027-10-03", we, c)).toMatchObject({ ok: true, hols: ["Tag der Deutschen Einheit"] });
  });

  it("lange Wochenenden: Fr–Mo mit Allerheiligen (nur NRW), Niedersachsen braucht 1 Urlaubstag", () => {
    const f = fits("2027-10-29", "2027-11-01", { days: "weekend" }, ctx());
    expect(f).toMatchObject({ ok: true, vac: { "DE-NI": 1 }, hols: ["Allerheiligen"] });
    expect(fits("2027-09-17", "2027-09-20", { days: "weekend" }, ctx()).ok).toBe(false);
  });

  it("schulkindkonform: Feiertag muss in der Region der Schulkinder gelten", () => {
    expect(fits("2027-10-29", "2027-11-01", { days: "weekend", school: true }, ctx(["DE-NW"])).ok).toBe(true);
    expect(fits("2027-10-29", "2027-11-01", { days: "weekend", school: true }, ctx(["DE-NI"])).ok).toBe(false);
  });

  it("in den Ferien jeder Starttag (schulkindkonform), mit Urlaubstagen für Berufstätige", () => {
    const f = fits("2027-10-11", "2027-10-14", { days: "weekend", school: true }, ctx(["DE-NW"]));
    expect(f).toMatchObject({ ok: true, vac: { "DE-NW": 3, "DE-NI": 3 }, ferien: { "DE-NW": "Herbstferien NRW", "DE-NI": "Herbstferien Niedersachsen" } });
    // ohne „schulkindkonform“ zählen Ferien bei Wochenenden nicht
    expect(fits("2027-10-11", "2027-10-14", { days: "weekend" }, ctx()).ok).toBe(false);
    // Ferien meiden schließt sie aus
    expect(fits("2027-10-11", "2027-10-14", { days: "weekend", school: true, ferien: "avoid" }, ctx()).ok).toBe(false);
  });

  it("Ferien meiden: irgendeine Region; nur Ferien: alle Regionen", () => {
    expect(fits("2027-10-08", "2027-10-10", { ferien: "avoid" }, ctx()).ok).toBe(false);
    expect(fits("2027-10-01", "2027-10-03", { ferien: "avoid" }, ctx()).ok).toBe(true);
    expect(fits("2027-10-15", "2027-10-18", { ferien: "only" }, ctx()).ok).toBe(true);
    expect(fits("2027-10-10", "2027-10-12", { ferien: "only" }, ctx()).ok).toBe(false);
  });

  it("Brückentage: ein Werktag zwischen Feiertag und Wochenende, nicht schulkindkonform", () => {
    const c = ctx();
    (c.marks["DE-NW"]["2027-05-13"] ||= {}).pub = "Christi Himmelfahrt"; // Donnerstag
    (c.marks["DE-NI"]["2027-05-13"] ||= {}).pub = "Christi Himmelfahrt";
    expect(fits("2027-05-12", "2027-05-16", { days: "weekend" }, c).ok).toBe(false);
    expect(fits("2027-05-12", "2027-05-16", { days: "weekend", bridges: true }, c)).toMatchObject({ ok: true, vac: { "DE-NW": 1, "DE-NI": 1 } });
    expect(fits("2027-05-12", "2027-05-16", { days: "weekend", bridges: true, school: true }, c).ok).toBe(false);
  });

  it("passende Starttage und Tage fürs Raster; Vorgabe schulkindkonform mit Schulkindern", () => {
    const days = Array.from({ length: 30 }, (_, i) => addDay("2027-09-01", i));
    const starts = fittingStarts(days, 2, "2027-09-30", { days: "weekend" }, ctx());
    expect(starts).toEqual(["2027-09-03", "2027-09-10", "2027-09-17", "2027-09-24"]);
    expect([...usefulDays(starts.slice(0, 1), 2)]).toEqual(["2027-09-03", "2027-09-04", "2027-09-05"]);
    expect(defaultCfg(ctx()).school).toBe(true);
    expect(defaultCfg(ctx([])).school).toBeUndefined();
  });
});
