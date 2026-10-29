import { describe, expect, it } from "vitest";
import { parseConsent } from "./app.svelte";
import { seal } from "../../../../worker/src/apikey";

describe("Zustimmung für Chat-Apps (#590)", () => {
  it("liest Name, Ziel und Ablauf aus der signierten Anfrage des Such-Dienstes", async () => {
    const req = await seal("geheim", "req", { k: "x", n: "Claude für Jürgen", h: "claude.ai", r: "https://claude.ai/cb", s: "", p: "y", x: 1_900_000_000_000 });
    expect(parseConsent(req)).toEqual({ req, client: "Claude für Jürgen", host: "claude.ai", until: 1_900_000_000_000 });
  });
  it("Unsinn ergibt nichts", () => {
    expect(parseConsent("kaputt")).toBeNull();
    expect(parseConsent(`${btoa(JSON.stringify({ n: 1 }))}.sig`)).toBeNull();
  });
});
