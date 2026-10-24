import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() });
vi.stubGlobal("scrollTo", () => {});
vi.stubGlobal("location", { href: "http://localhost/", search: "", hash: "", pathname: "/", origin: "http://localhost" });

describe("Umschalten auf Detailliert (#544)", () => {
  beforeEach(() => { mem.clear(); vi.resetModules(); });

  it("ohne Betrag entsteht kein leerer Posten", async () => {
    const s = await import("./store.svelte");
    s.newTrip({ place: "" });
    s.setDetailed("stay", true, true);
    expect(s.app.trip.items.filter(i => i.cat === "stay")).toHaveLength(0);
  });

  it("mit Betrag wird daraus ein Posten", async () => {
    const s = await import("./store.svelte");
    s.newTrip({ place: "" });
    s.app.trip.simple = { ...(s.app.trip.simple || {}), stay: 500 } as typeof s.app.trip.simple;
    s.setDetailed("stay", true, true);
    expect(s.app.trip.items.filter(i => i.cat === "stay")).toHaveLength(1);
  });
});
