import { beforeEach, describe, expect, it, vi } from "vitest";

// Store braucht localStorage und scrollTo; im Testlauf (node) nachgebildet
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() });
vi.stubGlobal("scrollTo", () => {});
vi.stubGlobal("location", { href: "http://localhost/", search: "", hash: "", pathname: "/", origin: "http://localhost" });

describe("Versteckte Details verwerfen (#423)", () => {
  beforeEach(() => { mem.clear(); vi.resetModules(); });

  it("automatische Posten bleiben beim Verwerfen erhalten", async () => {
    const s = await import("./store.svelte");
    s.newTrip({ place: "" });
    const price = { mode: "unit", currency: "EUR", unit: 10 } as const;
    s.app.trip.items = [
      { id: "a", cat: "misc", auto: "souvenir", name: "Souvenirs", status: "idea", options: [{ id: "o", label: "", price }] },
      { id: "b", cat: "misc", name: "Eigener Posten", status: "idea", options: [{ id: "p", label: "", price }] }
    ];
    s.discardDetails("misc");
    expect(s.app.trip.items.map(i => i.id)).toEqual(["a"]);
  });
});
