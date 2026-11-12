import { afterEach, describe, it, expect, vi } from "vitest";
import { suggest, withHome, type Place } from "./plz";

const pl = { lat: 50.1, lon: 8.2, ort: "Stadt X" };
describe("withHome", () => {
  it("setzt den Wohnort nur, wo keiner ist", () => {
    const hh = { A: { geo: { lat: 1, lon: 2, ort: "Ort Y" }, plz: "11111" }, B: {} as { plz?: string; geo?: typeof pl } };
    const out = withHome(hh, ["A", "B", "B", "C"], { plz: "12345", ...pl, cc: "DE" });
    expect(out.A.plz).toBe("11111");
    expect(out.B).toEqual({ plz: "12345", geo: pl });
    expect(out.C.geo?.ort).toBe("Stadt X");
    expect(hh.B.geo).toBeUndefined();
    // Land außerhalb Deutschlands wird mitgespeichert (#163)
    expect(withHome({}, ["X"], { plz: "1010", ort: "Wien", lat: 48.2, lon: 16.4, cc: "AT" }).X).toEqual({ plz: "1010", cc: "AT", geo: { lat: 48.2, lon: 16.4, ort: "Wien" } });
  });
});

describe("Vorschläge", () => {
  const table = new Map<string, Place>([
    ["40210", { lat: 51.22, lon: 6.78, ort: "Düsseldorf" }], ["40211", { lat: 51.23, lon: 6.79, ort: "Düsseldorf" }],
    ["41460", { lat: 51.2, lon: 6.69, ort: "Neuss" }], ["50667", { lat: 50.94, lon: 6.96, ort: "Köln" }]
  ]);

  it("Ziffern suchen am Anfang der PLZ, Buchstaben am Anfang des Orts (ohne Groß und Klein), leer nichts", () => {
    expect(suggest(table, "4").map(([p]) => p)).toEqual(["40210", "40211", "41460"]);
    expect(suggest(table, " 402 ").map(([p]) => p)).toEqual(["40210", "40211"]);
    expect(suggest(table, "kö").map(([, p]) => p.ort)).toEqual(["Köln"]);
    expect(suggest(table, "dorf")).toEqual([]);
    expect(suggest(table, "  ")).toEqual([]);
  });

  it("höchstens so viele Vorschläge wie gewünscht", () => {
    expect(suggest(table, "4", 2)).toHaveLength(2);
  });
});

describe("Tabelle laden", () => {
  // Format der Datei: PLZ (5), Breite und Länge als je 5 Ziffern (Tausendstel Grad ab 47° N bzw. 5° O), Ort; getrennt mit |
  const FILE = ["40210" + "04223" + "01779" + "Düsseldorf", "40211" + "04230" + "01790" + "Düsseldorf", "50667" + "03938" + "01958" + "Köln", "kaputt", ""].join("|");
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it("liest PLZ, Koordinaten und Ort; kaputte Einträge fallen weg; geladen wird nur einmal", async () => {
    const fetch = vi.fn(async () => ({ text: async () => FILE }));
    vi.stubGlobal("fetch", fetch);
    vi.resetModules();
    const { loadPlz } = await import("./plz");
    const [a, b] = await Promise.all([loadPlz(), loadPlz()]);
    expect(a).toBe(b);
    expect(await loadPlz()).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect([...a.keys()]).toEqual(["40210", "40211", "50667"]);
    const d = a.get("40210")!;
    expect(d.ort).toBe("Düsseldorf");
    expect(d.lat).toBeCloseTo(51.223, 3);
    expect(d.lon).toBeCloseTo(6.779, 3);
  });
});
