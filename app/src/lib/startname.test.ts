import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() });
vi.stubGlobal("scrollTo", () => {});
vi.stubGlobal("location", { href: "http://localhost/", search: "", hash: "", pathname: "/", origin: "http://localhost" });

describe("Reise anlegen mit vorläufigem Namen (#545)", () => {
  beforeEach(() => { mem.clear(); vi.resetModules(); });

  it("trägt den angekündigten Namen ein und lässt ihn Ort und Zeitraum folgen", async () => {
    const s = await import("./store.svelte");
    s.startTrip(undefined, "Gruppenreise 🦊 Fuchs");
    expect(s.app.trip.name).toBe("Gruppenreise 🦊 Fuchs");
    expect(s.app.trip.autoName).toBe(true);
  });
});
