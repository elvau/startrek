/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { healthBody } from "./health";

describe("/health", () => {
  it("meldet angebundene Unterkunftsquellen, ohne Schlüssel", () => {
    const b = healthBody({ LITEAPI_KEY: "geheim-123", BOOKING_MCP_URL: "https://mcp.example/geheim" });
    expect(b.stays).toEqual(["booking", "trivago", "liteapi"]);
    expect(JSON.stringify(b)).not.toMatch(/geheim/);
    expect(healthBody({}).stays).toEqual(["trivago"]);
  });

  it("nennt den Stand des Dienstes, wenn er bekannt ist", () => {
    expect(healthBody({}, "1.2.3").version).toBe("1.2.3");
    expect("version" in healthBody({})).toBe(false);
  });
});
