/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { goLink, openGo } from "./go";

describe("Weiterleitung über splitandfly.com/go/", () => {
  it("signiert das Ziel, zählt den Klick und lehnt Veränderte ab", async () => {
    const points: unknown[] = [];
    const env = { USAGE: { writeDataPoint: (p: unknown) => points.push(p) } } as any;
    const link = await goLink("geheim", "https://splitandfly.com", "https://kiwi.com/booking?x=1", "Kiwi.com", "flights");
    expect(link.startsWith("https://splitandfly.com/go/?l=")).toBe(true);
    const tok = new URL(link).searchParams.get("l")!;
    expect(await openGo("geheim", tok, env)).toBe("https://kiwi.com/booking?x=1");
    expect(points).toEqual([{ blobs: ["click", "kiwi-com", "flights"], doubles: [1], indexes: ["click"] }]);
    expect(await openGo("anders", tok, env)).toBeNull();
    const [body, sig] = tok.split(".");
    expect(await openGo("geheim", `${body.slice(0, -2)}xx.${sig}`, env)).toBeNull();
    // ohne Anbieter: Host als Kennung; keine https-Adresse: bleibt, wie sie ist
    const host = new URL(await goLink("geheim", "https://splitandfly.com/", "https://www.booking.com/h", "", "stay")).searchParams.get("l")!;
    await openGo("geheim", host, env);
    expect((points[1] as any).blobs[1]).toBe("booking-com");
    expect(await goLink("geheim", "https://splitandfly.com/", "javascript:alert(1)", "x", "misc")).toBe("javascript:alert(1)");
  });
});
