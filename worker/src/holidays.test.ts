import { describe, expect, it } from "vitest";
import { fetchHolidays } from "./holidays";

describe("Ferien und Feiertage (#163)", () => {
  it("holt beide Listen für das Land, Zeitraum dieses und nächstes Jahr", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      const body = u.includes("School") ? [{ startDate: "2027-02-01", endDate: "2027-02-06", name: [{ language: "DE", text: "Semesterferien" }], nationwide: true }] : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const d = await fetchHolidays("AT", "2026-10-13", f);
    expect(d.school).toHaveLength(1);
    expect(d.public).toEqual([]);
    expect(urls.every(u => u.includes("countryIsoCode=AT&validFrom=2026-01-01&validTo=2027-12-31"))).toBe(true);
  });
  it("Land ohne Daten: leer; Ausfall der Quelle: Fehler", async () => {
    const empty = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    expect(await fetchHolidays("US", "2026-10-13", empty)).toEqual({ school: [], public: [] });
    const down = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchHolidays("AT", "2026-10-13", down)).rejects.toThrow(/503/);
  });
});
