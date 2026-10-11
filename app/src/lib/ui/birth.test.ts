import { describe, expect, it } from "vitest";
import { birthParts, birthValue } from "./birth";

const today = new Date(2026, 9, 11);
describe("Geburtsdatum in Teilen", () => {
  it("zerlegt und setzt zusammen", () => {
    expect(birthParts("1990-03-05")).toEqual({ d: "5", m: "3", y: "1990" });
    expect(birthParts("")).toEqual({ d: "", m: "", y: "" });
    expect(birthValue({ d: "5", m: "3", y: "1990" }, today)).toBe("1990-03-05");
  });
  it("unvollständig, halbes Jahr, Zukunft oder vor 1900 ergibt nichts", () => {
    expect(birthValue({ d: "5", m: "", y: "1990" }, today)).toBe("");
    expect(birthValue({ d: "5", m: "3", y: "199" }, today)).toBe("");
    expect(birthValue({ d: "12", m: "10", y: "2026" }, today)).toBe("");
    expect(birthValue({ d: "1", m: "1", y: "1899" }, today)).toBe("");
  });
  it("Tag passt sich dem Monat an", () => {
    expect(birthValue({ d: "31", m: "2", y: "2001" }, today)).toBe("2001-02-28");
    expect(birthValue({ d: "31", m: "2", y: "2000" }, today)).toBe("2000-02-29");
  });
});
