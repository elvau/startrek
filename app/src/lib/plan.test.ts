import { describe, expect, it } from "vitest";
import { parsePlan, stripPlan } from "./plan";

describe("parsePlan", () => {
  it("Gruppe mit Ziel und Land", () => {
    expect(parsePlan("?ziel=Palma&land=es&gruppe=8&name=JGA%20Mallorca")).toEqual({ place: "Palma", cc: "ES", name: "JGA Mallorca", group: 8 });
  });
  it("Familien statt Gruppe, Grenzen eingehalten", () => {
    expect(parsePlan("?ziel=Blåvand&land=DK&fam=2-2,2-1,9-20,x")).toEqual({ place: "Blåvand", cc: "DK", fam: [{ adults: 2, kids: 2 }, { adults: 2, kids: 1 }, { adults: 6, kids: 8 }] });
    expect(parsePlan("?ziel=Prag&gruppe=500")?.group).toBe(40);
  });
  it("ohne Ziel nichts, ungültiges Land weg", () => {
    expect(parsePlan("?gruppe=4")).toBeNull();
    expect(parsePlan("?ziel=Prag&land=Tschechien")).toEqual({ place: "Prag" });
  });
  it("Adresse danach ohne Plan-Angaben, andere bleiben", () => {
    expect(stripPlan(new URL("https://x/?ziel=Prag&gruppe=4&join=a.b.editor")).search).toBe("?join=a.b.editor");
  });
});
