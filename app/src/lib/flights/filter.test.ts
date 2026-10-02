import { describe, expect, it } from "vitest";
import { activeCount, applyFilter, arrivalGap, dayCells, facets, noFilter, sortFlights, tier, type Filterable } from "./filter";

const leg = (dep: string, minutes: number, stops: number, carriers = ["Eurowings"]) => ({ dep, arr: dep, minutes, stops, carriers });
const f = (id: string, total: number, out: ReturnType<typeof leg>, back?: ReturnType<typeof leg>, origin = "DUS"): Filterable => ({ id, origin, total, out, back, accessHours: 0 });

const L = [
  f("a", 300, leg("2027-08-12T06:00", 150, 0), leg("2027-08-19T20:00", 150, 0)),
  f("b", 200, leg("2027-08-12T14:00", 300, 1, ["Lufthansa"]), leg("2027-08-19T09:00", 280, 1, ["Lufthansa"]), "CGN"),
  f("c", 150, leg("2027-08-13T10:00", 600, 2, ["Turkish"]), leg("2027-08-20T10:00", 610, 2, ["Turkish"])),
  f("d", 250, leg("2027-08-12T18:00", 160, 0), leg("2027-08-20T07:00", 160, 0))
];

describe("Flugfilter", () => {
  it("Umstiege kumulativ mit Anzahl und Preis ab", () => {
    expect(facets(L, noFilter()).stops).toEqual([{ key: 0, count: 2, min: 250 }, { key: 1, count: 3, min: 200 }, { key: 2, count: 4, min: 150 }]);
    expect(applyFilter(L, { ...noFilter(), stops: 0 }).map(o => o.id)).toEqual(["a", "d"]);
  });

  it("Abflughafen und Airline; Anzahl rechnet die anderen Filter mit", () => {
    const fl = { ...noFilter(), stops: 1 };
    expect(facets(L, fl).origins).toEqual([{ key: "CGN", count: 1, min: 200 }, { key: "DUS", count: 2, min: 250 }]);
    expect(applyFilter(L, { ...noFilter(), airlines: ["Turkish"] }).map(o => o.id)).toEqual(["c"]);
    expect(applyFilter(L, { ...noFilter(), origins: ["CGN"] }).map(o => o.id)).toEqual(["b"]);
  });

  it("Abflugzeiten und Flugdauer", () => {
    expect(applyFilter(L, { ...noFilter(), outDep: [8, 16] }).map(o => o.id)).toEqual(["b", "c"]);
    expect(applyFilter(L, { ...noFilter(), backDep: [12, 24] }).map(o => o.id)).toEqual(["a"]);
    expect(applyFilter(L, { ...noFilter(), maxHours: 5 }).map(o => o.id)).toEqual(["a", "b", "d"]);
    expect(facets(L, noFilter()).longest).toBe(11);
    expect(activeCount({ ...noFilter(), maxHours: 5, outDep: [6, 24], outDay: "2027-08-12" })).toBe(2);
    expect(activeCount({ ...noFilter(), together: 3 })).toBe(1);
  });

  it("Kalender: Hinflug-Tage, dann Rückflug-Tage zum gewählten Hinflug", () => {
    expect(dayCells(L, noFilter(), "out")).toEqual([{ day: "2027-08-12", min: 200, stops: 0, count: 3 }, { day: "2027-08-13", min: 150, stops: 2, count: 1 }]);
    const fl = { ...noFilter(), outDay: "2027-08-12" };
    expect(dayCells(L, fl, "back")).toEqual([{ day: "2027-08-19", min: 200, stops: 0, count: 2 }, { day: "2027-08-20", min: 250, stops: 0, count: 1 }]);
    // gewählter Rückflug schränkt die Hinflug-Tage nicht ein
    expect(dayCells(L, { ...fl, backDay: "2027-08-20" }, "out")).toHaveLength(2);
    expect(applyFilter(L, { ...fl, backDay: "2027-08-20" }).map(o => o.id)).toEqual(["d"]);
  });

  it("Preisstufen für die Farbe", () => {
    const cells = [{ day: "1", min: 100, stops: 0, count: 1 }, { day: "2", min: 200, stops: 0, count: 1 }, { day: "3", min: 400, stops: 0, count: 1 }];
    expect(cells.map(c => tier(c.min, cells))).toEqual([0, 1, 2]);
    expect(tier(100, [cells[0]])).toBe(0);
  });

  it("Sortierung: günstigste, beste, schnellste, früheste Ankunft", () => {
    expect(sortFlights(L, "price").map(o => o.id)).toEqual(["c", "b", "d", "a"]);
    // c ist billig, aber 20 h unterwegs mit 4 Umstiegen
    expect(sortFlights(L, "best")[0].id).toBe("d");
    expect(sortFlights(L, "time").map(o => o.id)).toEqual(["a", "d", "b", "c"]);
    expect(sortFlights(L, "arrival").map(o => o.id)).toEqual(["a", "b", "d", "c"]);
  });
});

describe("Zusammen ankommen", () => {
  const at = (arr: string, back?: string) => f(arr, 100, { dep: arr, arr, minutes: 120, stops: 0, carriers: ["X"] }, back ? { dep: back, arr: back, minutes: 120, stops: 0, carriers: ["X"] } : undefined);
  const refs = [{ who: "Klein", arr: "2027-08-12T14:00", dep: "2027-08-19T18:00" }];
  const L2 = [at("2027-08-12T14:30", "2027-08-19T17:00"), at("2027-08-12T16:30", "2027-08-19T18:00"), at("2027-08-12T21:00", "2027-08-19T18:00"), at("2027-08-12T13:00", "2027-08-19T08:00")];
  it("Landung und Rückflug höchstens so viele Stunden auseinander", () => {
    expect(applyFilter(L2, { ...noFilter(), together: 1 }, refs).map(o => o.id)).toEqual(["2027-08-12T14:30"]);
    expect(applyFilter(L2, { ...noFilter(), together: 3 }, refs)).toHaveLength(2);
    // ohne andere Flüge filtert „zusammen“ nichts
    expect(applyFilter(L2, { ...noFilter(), together: 1 }, [])).toHaveLength(4);
  });
  it("Auswahl ± 1, 3, 6 Stunden mit Anzahl, nur Spannen, die etwas ändern", () => {
    expect(facets(L2, noFilter(), refs).together.map(x => [x.key, x.count])).toEqual([[1, 1], [3, 2]]);
    expect(facets(L2, noFilter(), []).together).toEqual([]);
  });
  it("Abstand zur nächsten Landung", () => {
    expect(arrivalGap(L2[1], refs)).toEqual({ min: 150, who: "Klein" });
    expect(arrivalGap(L2[3], refs)).toEqual({ min: -60, who: "Klein" });
    expect(arrivalGap(L2[0], [])).toBeNull();
  });
});
