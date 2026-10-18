import { describe, expect, it } from "vitest";
import { applyClaims, claimable, cleanName, travelerOf } from "./claims";
import { DEFAULT_SETTINGS, type Trip } from "./model";

const trip = (): Trip => ({
  id: "t", name: "JGA", place: "Palma", country: "Spanien",
  travelers: [
    { id: "a", name: "Dani", household: "Dani", age: 34, member: "u0" },
    { id: "b", name: "Dachs", household: "Dachs", kind: "adult", placeholder: true },
    { id: "c", name: "Fuchs Kind 1", household: "Fuchs", kind: "child", placeholder: true },
    { id: "d", name: "Otter", household: "Otter", kind: "adult", placeholder: true },
    { id: "e", name: "Biber", household: "Biber", kind: "adult", placeholder: true, active: false }
  ],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
});

describe("Wer bist du? (#435)", () => {
  it("wählbar: aktive Erwachsene ohne Konto, keine Kinder, nichts schon Vergebenes", () => {
    expect(claimable(trip()).map(x => x.id)).toEqual(["b", "d"]);
    expect(claimable(trip(), { u1: { t: "b", n: "Jonas" } }).map(x => x.id)).toEqual(["d"]);
    // die eigene Wahl bleibt wählbar (umentscheiden)
    expect(claimable(trip(), { u1: { t: "b", n: "Jonas" } }, "u1").map(x => x.id)).toEqual(["b", "d"]);
  });

  it("übernimmt Zuordnungen: Konto am Reisenden, Platzhalter bekommt den Vornamen; gelöste Zuordnung fällt weg", () => {
    const t = trip();
    expect(applyClaims(t, { u0: { t: "a", n: "Daniel" }, u1: { t: "b", n: "Jonas" } })).toBe(true);
    expect(t.travelers[0]).toMatchObject({ name: "Dani", member: "u0" });
    expect(t.travelers[1]).toMatchObject({ name: "Jonas", member: "u1", placeholder: false });
    expect(applyClaims(t, { u0: { t: "a", n: "Daniel" }, u1: { t: "b", n: "Jonas" } })).toBe(false);
    expect(applyClaims(t, { u0: { t: "a", n: "Daniel" } })).toBe(true);
    expect(t.travelers[1].member).toBeUndefined();
    expect(t.travelers[1].name).toBe("Jonas");
  });

  it("Vorname bereinigt; Reisender zu einem Konto", () => {
    expect(cleanName("  Jonas\n ")).toBe("Jonas");
    expect(cleanName("x".repeat(60))).toHaveLength(40);
    const t = trip();
    expect(travelerOf(t, "u0")?.id).toBe("a");
    expect(travelerOf(t, "u9", { u9: { t: "d", n: "Lea" } })?.id).toBe("d");
    expect(travelerOf(t, "u9")).toBeUndefined();
  });
});
