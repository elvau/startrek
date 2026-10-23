import { describe, expect, it } from "vitest";

// Zeitraum in Nächten (#538): liegen beide Griffe übereinander, muss „von“ oben liegen, sonst klemmt der Regler
const SRC = import.meta.glob("./DualRange.svelte", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const src = Object.values(SRC)[0];
describe("DualRange", () => {
  it("„von“-Griff kommt bei gleichem Wert nach oben", () => {
    expect(src).toMatch(/value=\{lo\}[^>]*style:z-index=\{lo === hi && lo > min \? 3 : 1\}/);
    expect(src).toMatch(/value=\{hi\}[^>]*style:z-index="2"/);
  });
});
