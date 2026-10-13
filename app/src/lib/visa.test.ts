import { describe, expect, it } from "vitest";
import { bestEntry, entryFor, natsOf, needsAction } from "./visa";
import data from "../../../public/visa.json";

describe("Einreise je Staatsangehörigkeit", () => {
  it("deutscher Pass: Ecuador 90 Tage frei, USA ESTA, Indien e-Visum, Nordkorea Visum", () => {
    expect(entryFor(data, "DE", "EC")).toEqual({ kind: "free", days: 90 });
    expect(entryFor(data, "DE", "US").kind).toBe("eta");
    expect(entryFor(data, "DE", "IN").kind).toBe("evisa");
    expect(entryFor(data, "DE", "KP").kind).toBe("visa");
    expect(entryFor(data, "DE", "DE").kind).toBe("home");
    expect(needsAction(entryFor(data, "DE", "EC"))).toBe(false);
  });
  it("russischer Pass: Deutschland Visum vorab", () => {
    expect(entryFor(data, "RU", "DE").kind).toBe("visa");
    expect(entryFor(data, "ZZ", "DE").kind).toBe("unknown");
  });
  it("mehrere Pässe: der günstigste (deutsch/russisch in die USA, längere visumfreie Zeit)", () => {
    expect(natsOf({ nat: "RU", nat2: "DE" })).toEqual(["RU", "DE"]);
    expect(natsOf({})).toEqual(["DE"]);
    expect(bestEntry(data, ["RU", "DE"], "US")).toMatchObject({ nat: "DE", kind: "eta", multi: true });
    expect(bestEntry(data, ["DE"], "DE")).toEqual({ kind: "home", nat: "DE" });
    const d = { cc: ["XX"], m: { AA: "30", BB: "90" } };
    expect(bestEntry(d, ["AA", "BB"], "XX")).toEqual({ kind: "free", days: 90, nat: "BB", multi: true });
  });
});
