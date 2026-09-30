import { describe, expect, it } from "vitest";
import { cloudflareRows, consoleLinks, fmtBytes, GB, level, providerRows, routeRows, type UsageReport } from "./usage";

const days = ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"];
const rep = (p: Partial<UsageReport>): UsageReport => ({ at: "2026-09-30T12:00:00Z", days, errors: {}, config: {}, ...p });

describe("Admin: Nutzung", () => {
  it("Warnstufen ab 70 und 90 Prozent", () => {
    expect([level(null), level(0.69), level(0.7), level(0.95)]).toEqual(["ok", "ok", "warn", "high"]);
  });

  it("Cloudflare: heutige Worker-Aufrufe gegen 100.000, R2 gegen die Monatsgrenzen", () => {
    const rows = cloudflareRows(rep({
      worker: { requests: [1, 2, 3, 4, 5, 6, 75_000], errors: [0, 0, 0, 0, 0, 0, 3], subrequests: [0, 0, 0, 0, 0, 0, 0] },
      r2: { bytes: 9.5 * GB, objects: 10, classA: 1000, classB: 20 }
    }));
    expect(rows.map(r => [r.id, r.value, r.level])).toEqual([["workers", 75_000, "warn"], ["r2size", 9.5 * GB, "high"], ["r2a", 1000, "ok"], ["r2b", 20, "ok"]]);
    expect(rows[0].note).toEqual({ key: "adm.errors", n: 3 });
    expect(cloudflareRows(rep({}))).toEqual([]);
  });

  it("Anbieter mit Namen, Gemini je Modell, Grenze pro Minute ohne Anteil", () => {
    const rows = providerRows(rep({ series: [
      { kind: "api", name: "app.ticketmaster.com", detail: "", byDay: [0, 0, 0, 0, 0, 0, 4600] },
      { kind: "api", name: "api.football-data.org", detail: "", byDay: [0, 0, 0, 0, 0, 0, 500] },
      { kind: "api", name: "generativelanguage.googleapis.com", detail: "gemini-3.8-flash", byDay: [0, 0, 0, 0, 0, 0, 150] },
      { kind: "api", name: "neu.example", detail: "", byDay: [0, 0, 0, 0, 0, 0, 1] },
      { kind: "route", name: "flights", detail: "", byDay: [0, 0, 0, 0, 0, 0, 1] }
    ] }), 250);
    expect(rows.map(r => [r.label, r.share, r.level])).toEqual([
      ["Ticketmaster", 0.92, "high"], ["football-data.org", null, "ok"], ["Gemini · gemini-3.8-flash", 0.6, "ok"], ["neu.example", null, "ok"]
    ]);
    expect(providerRows(rep({ series: [{ kind: "api", name: "generativelanguage.googleapis.com", detail: "m", byDay: [1] }] }))[0].limit).toBeUndefined();
  });

  it("Funktionen: Aufrufe mit und ohne Zwischenspeicher zusammen", () => {
    const rows = routeRows(rep({ series: [
      { kind: "route", name: "flights", detail: "", byDay: [1, 0, 0, 0, 0, 2, 5] },
      { kind: "route", name: "flights", detail: "hit", byDay: [0, 0, 0, 0, 0, 1, 3] },
      { kind: "route", name: "agent", detail: "", byDay: [0, 0, 0, 0, 0, 0, 2] }
    ] }));
    expect(rows.map(r => [r.label, r.value, r.week, r.note])).toEqual([
      ["adm.r.flights", 8, [1, 0, 0, 0, 0, 3, 8], { key: "adm.cached", n: 3 }],
      ["adm.r.agent", 2, [0, 0, 0, 0, 0, 0, 2], undefined]
    ]);
  });

  it("Konsolen-Links mit Projekt, Größen lesbar", () => {
    expect(consoleLinks("p1")[0].href).toBe("https://console.firebase.google.com/project/p1/usage/details");
    expect(fmtBytes(1536, "de-DE")).toBe("1,5 KB");
    expect(fmtBytes(10 * GB, "en-US")).toBe("10 GB");
  });
});
