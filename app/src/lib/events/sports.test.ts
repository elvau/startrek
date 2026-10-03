import { describe, expect, it } from "vitest";
import { searchSports, SPORTS, SPORT_FILTERS } from "./sports";
import { parseEventQuery, searchEvents } from "./search";

const TODAY = "2026-10-03";
const ids = (l: { id: string }[]) => l.map(e => e.id.replace("sp:", ""));

describe("Sportkalender", () => {
  it("Daten: eindeutige IDs, gültige Termine, Koordinaten, https-Links", () => {
    expect(new Set(SPORTS.map(e => e.id)).size).toBe(SPORTS.length);
    for (const e of SPORTS) {
      expect(e.start, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (e.end) expect(e.end >= e.start, e.id).toBe(true);
      expect(Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180 && (e.lat || e.lon), e.id).toBeTruthy();
      expect(e.url, e.id).toMatch(/^https:\/\//);
      expect(SPORT_FILTERS, e.id).toContain(e.sport);
    }
  });
  it("Stichwort: alle Wörter, auch deutsch und ohne Akzente; Olympia findet Sommer- und Winterspiele", () => {
    expect(ids(searchSports({ q: "Berlin Marathon" }, TODAY))).toEqual(["ber27"]);
    expect(ids(searchSports({ q: "olympia" }, TODAY))).toEqual(["dakar26", "la28", "la28p", "alps30", "bne32"]);
    expect(ids(searchSports({ q: "Winterspiele" }, TODAY))).toEqual(["alps30"]);
    expect(ids(searchSports({ q: "vierschanzentournee" }, TODAY))).toHaveLength(4);
    expect(ids(searchSports({ q: "Roland Garros" }, TODAY))).toEqual(["rg27"]);
    expect(searchSports({ q: "marathon", lang: "de" }, TODAY).find(e => e.id === "sp:rom27")?.name).toBe("Rom-Marathon 2027");
    expect(searchSports({ q: "marathon" }, TODAY).find(e => e.id === "sp:rom27")?.name).toBe("Rome Marathon 2027");
  });
  it("Sportart: selbst mitmachen nur mit Anmeldung, Mannschaftssport, Wintersport", () => {
    const join = searchSports({ q: "", sport: "join" }, TODAY);
    expect(join.length).toBeGreaterThan(15);
    expect(join.every(e => e.join)).toBe(true);
    expect(join.find(e => e.id === "sp:bos27")?.join).toBe("qualify");
    expect(ids(searchSports({ q: "", sport: "team" }, TODAY))).toEqual(["hb27", "sb61", "ih27", "fiba27", "rwc27"]);
    expect(searchSports({ q: "", sport: "ski" }, TODAY).every(e => e.sport === "ski")).toBe(true);
    // Stichwort „mitmachen“ wie die Auswahl
    expect(searchSports({ q: "mitmachen ski" }, TODAY).map(e => e.id)).toEqual(["sp:vasa27", "sp:eng27"]);
  });
  it("vorbei ist vorbei, laufende mehrtägige Events zählen; ohne Stichwort, Sportart oder Ort nichts", () => {
    expect(ids(searchSports({ q: "chicago" }, "2026-10-12"))).toEqual(["chi27"]);
    expect(ids(searchSports({ q: "darts" }, "2026-12-20"))).toEqual(["wdc27"]);
    expect(searchSports({ q: "" }, TODAY)).toEqual([]);
  });
  it("vor Ort: Zeitraum, Beginn ab dem ersten Reisetag, nächster Spielort", () => {
    // Handball-WM: Reise nach München Mitte Januar → Vorrunde im SAP Garden
    const muc = searchSports({ q: "", city: "München", lat: 48.14, lon: 11.58, from: "2027-01-15", to: "2027-01-18", lang: "de" }, TODAY);
    const hb = muc.find(e => e.id === "sp:hb27")!;
    expect(hb).toMatchObject({ city: "München", venue: "SAP Garden", start: "2027-01-15", end: "2027-01-31", name: "Handball-WM 2027 in Deutschland" });
    expect(searchSports({ q: "", city: "Köln", lat: 50.94, lon: 6.96, from: "2027-03-01", to: "2027-03-05" }, TODAY).find(e => e.id === "sp:hb27")).toBeUndefined();
  });
  it("Such-Dienst: Sportart ohne Stichwort erlaubt, dann nur der Sportkalender; ohne Schlüssel trotzdem Treffer", async () => {
    expect(parseEventQuery({ q: "", sport: "run" })).toMatchObject({ q: "", sport: "run" });
    expect(typeof parseEventQuery({ q: "", sport: "fußball" })).toBe("string");
    const r = await searchEvents({ q: "", sport: "tennis" }, { TICKETMASTER_KEY: "k" }, () => { throw new Error("kein Netz"); });
    expect(r.sources.map(s => s.id)).toEqual(["sports"]);
    const v = await searchEvents({ q: "olympia brisbane" }, {});
    expect(v.events.map(e => e.id)).toEqual(["sp:bne32"]);
    expect(v.sources.find(s => s.id === "sports")).toMatchObject({ configured: true, ok: true });
  });
});
