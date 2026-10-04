import { describe, it, expect } from "vitest";
import { withHome } from "./plz";

const pl = { lat: 50.1, lon: 8.2, ort: "Stadt X" };
describe("withHome", () => {
  it("setzt den Wohnort nur, wo keiner ist", () => {
    const hh = { A: { geo: { lat: 1, lon: 2, ort: "Ort Y" }, plz: "11111" }, B: {} as { plz?: string; geo?: typeof pl } };
    const out = withHome(hh, ["A", "B", "B", "C"], "12345", pl);
    expect(out.A.plz).toBe("11111");
    expect(out.B).toEqual({ plz: "12345", geo: pl });
    expect(out.C.geo?.ort).toBe("Stadt X");
    expect(hh.B.geo).toBeUndefined();
  });
});
