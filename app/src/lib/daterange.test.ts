import { describe, expect, it } from "vitest";
import { addMonth, daysBetween, monthGrid, pickDay } from "./daterange";

describe("Zeitraum mit zwei Tipps", () => {
  it("erster Tipp setzt von, zweiter bis", () => {
    const a = pickDay({ from: "", to: "" }, "2026-06-12", "from");
    expect(a).toEqual({ from: "2026-06-12", to: "", picking: "to", done: false });
    const b = pickDay(a, "2026-06-20", a.picking);
    expect(b).toEqual({ from: "2026-06-12", to: "2026-06-20", picking: "from", done: true });
  });
  it("Tipp vor dem Anfang beginnt neu", () => {
    expect(pickDay({ from: "2026-06-12", to: "" }, "2026-06-10", "to")).toMatchObject({ from: "2026-06-10", to: "", done: false });
  });
  it("vorhandener Zeitraum: neuer Tipp startet von vorn", () => {
    expect(pickDay({ from: "2026-06-12", to: "2026-06-20" }, "2026-07-01", "from")).toMatchObject({ from: "2026-07-01", to: "" });
  });
  it("derselbe Tag nur bei Tagen (nicht Nächten)", () => {
    expect(pickDay({ from: "2026-06-12", to: "" }, "2026-06-12", "to").done).toBe(false);
    expect(pickDay({ from: "2026-06-12", to: "" }, "2026-06-12", "to", true)).toMatchObject({ to: "2026-06-12", done: true });
  });
});

describe("Monate", () => {
  it("Raster beginnt am Montag", () => {
    // 1.6.2026 ist ein Montag, 1.10.2026 ein Donnerstag
    expect(monthGrid("2026-06")[0]).toBe("2026-06-01");
    const okt = monthGrid("2026-10");
    expect(okt.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(okt.at(-1)).toBe("2026-10-31");
  });
  it("Monat weiterzählen über den Jahreswechsel", () => {
    expect(addMonth("2026-12", 1)).toBe("2027-01");
    expect(addMonth("2026-01", -1)).toBe("2025-12");
  });
  it("Tage zwischen zwei Daten", () => expect(daysBetween("2026-06-12", "2026-06-20")).toBe(8));
});
