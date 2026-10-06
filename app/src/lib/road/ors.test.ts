import { describe, expect, it } from "vitest";
import { fromOrs, parseRouteQuery, routeOrs, thin } from "./ors";

const geo = {
  features: [{
    geometry: { coordinates: [[6.78, 51.23], [7.5, 50.5], [8.68, 50.11], [9.5, 49.0], [11.58, 48.14]] },
    properties: { segments: [{ distance: 230400, duration: 8100 }, { distance: 395000, duration: 13800 }], way_points: [0, 2, 4] }
  }]
};

describe("Routen-Dienst (ORS)", () => {
  it("Anfrage: 2 bis 25 Punkte, gerundet", () => {
    expect(parseRouteQuery({ points: [[51.23456, 6.78], [48.1, 11.5]] })).toEqual([[51.235, 6.78], [48.1, 11.5]]);
    expect(typeof parseRouteQuery({ points: [[1, 2]] })).toBe("string");
    expect(typeof parseRouteQuery({ points: [[1, 2], [100, 2]] })).toBe("string");
  });
  it("Etappen mit km, Minuten und Verlauf je Wegpunkt-Paar", () => {
    const l = fromOrs(geo);
    expect(l.map(x => [x.km, x.min])).toEqual([[230.4, 135], [395, 230]]);
    expect(l[0].path[0]).toEqual([51.23, 6.78]);
    expect(l[0].path.at(-1)).toEqual([50.11, 8.68]);
    expect(l[1].path.at(-1)).toEqual([48.14, 11.58]);
  });
  it("Verlauf ausdünnen", () => {
    const p = Array.from({ length: 101 }, (_, i) => [50, 6 + i * 0.01] as [number, number]);
    const t = thin(p);
    expect(t.length).toBeLessThan(10);
    expect(t[0]).toEqual(p[0]);
    expect(t.at(-1)).toEqual(p[100]);
  });
  it("Schlüssel im Kopf, Fehler mit Status", async () => {
    let auth = "";
    const ok = (async (_u: string, init: RequestInit) => { auth = (init.headers as Record<string, string>).authorization; return new Response(JSON.stringify(geo)); }) as unknown as typeof fetch;
    expect((await routeOrs([[51.23, 6.78], [50.11, 8.68], [48.14, 11.58]], "k1", ok)).length).toBe(2);
    expect(auth).toBe("k1");
    const bad = (async () => new Response(JSON.stringify({ error: { message: "Quota" } }), { status: 429 })) as unknown as typeof fetch;
    await expect(routeOrs([[51.23, 6.78], [48.14, 11.58]], "k", bad)).rejects.toThrow("ORS 429: Quota");
  });
});
