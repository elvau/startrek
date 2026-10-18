import { describe, expect, it } from "vitest";
import b30_0 from "../../../../public/coast/30_0.json";
import b30_10 from "../../../../public/coast/30_-10.json";
import { coastKm, loadCoast } from "./coast";

// echte Daten aus public/coast (Natural Earth), über ein nachgestelltes fetch; andere Blöcke fehlen (404)
const files: Record<string, unknown> = { "30_0": b30_0, "30_-10": b30_10 };
const fake = (async (u: RequestInfo | URL) => {
  const b = /coast\/(.+)\.json$/.exec(String(u))?.[1] || "";
  return files[b] ? new Response(JSON.stringify(files[b])) : new Response("", { status: 404 });
}) as typeof fetch;

describe("Entfernung zum Meer (#441)", () => {
  it("am Strand wenig, im Landesinneren mehr, weit weg null", async () => {
    const arenal = { lat: 39.512, lon: 2.751 }, marratxi = { lat: 39.62, lon: 2.71 }, madrid = { lat: 40.4168, lon: -3.7038 };
    const cells = await loadCoast([arenal, marratxi, madrid], fake);
    expect(coastKm(arenal, cells)!).toBeLessThan(1.5);
    expect(coastKm(marratxi, cells)!).toBeGreaterThan(3);
    expect(coastKm(marratxi, cells)!).toBeLessThan(25);
    expect(coastKm(madrid, cells)).toBeNull();
  });
  it("fehlende Datei: keine Küste statt Fehler", async () => {
    const cells = await loadCoast([{ lat: 89.5, lon: 10 }], fake);
    expect(coastKm({ lat: 89.5, lon: 10 }, cells)).toBeNull();
  });
});
