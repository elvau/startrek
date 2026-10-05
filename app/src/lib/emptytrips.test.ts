import { beforeEach, describe, expect, it, vi } from "vitest";

// Store braucht localStorage und scrollTo; im Testlauf (node) nachgebildet
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() });
vi.stubGlobal("scrollTo", () => {});
vi.stubGlobal("location", { href: "http://localhost/", search: "", hash: "", pathname: "/", origin: "http://localhost" });

describe("Reisen ohne Kosten aufräumen (Fehlerbericht #21)", () => {
  beforeEach(() => { mem.clear(); vi.resetModules(); });

  it("leere Hintergrundreise nach dem Löschen der offenen zählt nicht mit", async () => {
    const s = await import("./store.svelte");
    s.newTrip({ place: "" });
    s.newTrip({ place: "" });
    // offene Reise ist unberührt (Hintergrundreise): kein Knopf
    expect(s.emptyTrips()).toHaveLength(0);
    await s.deleteTrip(s.app.trip.id);
    expect(s.emptyTrips()).toHaveLength(0);
    expect(s.homeTrips()).toHaveLength(0);
  });
});
