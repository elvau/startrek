import { describe, expect, it } from "vitest";

// Flug- und Streckenanzeigen nutzen arrow() (in ar ←), keinen fest eingebauten Pfeil (#325)
const SRC = import.meta.glob("./{FlightCard,FlightSearch,TransferOptions,ItemEditor,RouteMap}.svelte", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
describe("Pfeile in Flug- und Streckenanzeigen", () => {
  it("fünf Dateien gefunden", () => expect(Object.keys(SRC).length).toBe(5));
  for (const [f, src] of Object.entries(SRC)) {
    it(`${f} ohne festes →`, () => {
      const bad = src.split("\n").filter(l => l.includes("→") && !/^\s*(\/\/|\/\*|\*|<!--)/.test(l) && !/\/\/.*→/.test(l));
      expect(bad).toEqual([]);
    });
  }
});
