/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe as group, expect, it } from "vitest";
import { describe, isAdmin, lastDays, meter, noteRoute, usageReport } from "./usage";

const dataset = () => {
  const points: { blobs?: unknown[]; doubles?: number[] }[] = [];
  return { points, writeDataPoint: (p: { blobs?: unknown[]; doubles?: number[] }) => { points.push(p); } } as unknown as AnalyticsEngineDataset & { points: typeof points };
};
const ok = (body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
const NOW = Date.parse("2026-09-30T12:00:00Z");

group("Zählen", () => {
  it("Host und Gemini-Modell aus der Adresse", () => {
    expect(describe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent")).toEqual({ host: "generativelanguage.googleapis.com", detail: "gemini-3.8-flash" });
    expect(describe(new Request("https://app.ticketmaster.com/discovery/v2/events.json?keyword=x"))).toEqual({ host: "app.ticketmaster.com", detail: "" });
  });

  it("jede ausgehende Anfrage einmal, ohne Suchinhalt", async () => {
    const USAGE = dataset();
    const f = meter({ USAGE }, (async () => ok("{}")) as typeof fetch);
    await f("https://api.travelpayouts.com/v1/prices?origin=DUS&token=geheim");
    await f("https://mcp.kiwi.com/");
    expect(USAGE.points.map(p => p.blobs)).toEqual([["api", "api.travelpayouts.com", ""], ["api", "mcp.kiwi.com", ""]]);
    expect(JSON.stringify(USAGE.points)).not.toContain("geheim");
    noteRoute({ USAGE }, "flights", true);
    expect(USAGE.points[2].blobs).toEqual(["route", "flights", "hit"]);
  });

  it("ohne Datensatz unverändert, Fehler beim Zählen stören nicht", async () => {
    const f = (async () => ok("{}")) as typeof fetch;
    expect(meter({}, f)).toBe(f);
    const broken = { writeDataPoint: () => { throw new Error("voll"); } } as unknown as AnalyticsEngineDataset;
    expect((await meter({ USAGE: broken }, f)("https://x.test")).status).toBe(200);
  });

  it("Admin nur mit eingetragener UID", () => {
    expect(isAdmin({ ADMIN_UIDS: " abc , def" }, "def")).toBe(true);
    expect(isAdmin({ ADMIN_UIDS: "abc" }, "ab")).toBe(false);
    expect(isAdmin({}, "")).toBe(false);
  });
});

group("Bericht", () => {
  it("die letzten 7 Tage, ältester zuerst", () => {
    expect(lastDays(7, NOW)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("ohne Zugang zu Cloudflare nur der Hinweis", async () => {
    const r = await usageReport({}, { agentDaily: 5 }, (async () => { throw new Error("kein Netz"); }) as typeof fetch, NOW);
    expect(r.errors.setup).toContain("CF_API_TOKEN");
    expect(r.config.agentDaily).toBe(5);
  });

  it("Worker, R2 und eigene Zählung zusammengeführt", async () => {
    const calls: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push(url);
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
      if (url.endsWith("/analytics_engine/sql")) {
        expect(String(init.body)).toContain("FROM splitandfly_usage");
        return ok({ data: [
          { day: "2026-09-30 00:00:00", kind: "api", name: "generativelanguage.googleapis.com", detail: "gemini-3.8-flash", n: 12 },
          { day: "2026-09-29 00:00:00", kind: "api", name: "generativelanguage.googleapis.com", detail: "gemini-3.8-flash", n: "3" },
          { day: "2026-09-30 00:00:00", kind: "route", name: "flights", detail: "", n: 4 },
          { day: "2026-09-01 00:00:00", kind: "route", name: "flights", detail: "", n: 99 }
        ] });
      }
      const q = JSON.parse(String(init.body)).query as string;
      if (q.includes("workersInvocationsAdaptive")) return ok({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [
        { sum: { requests: 100, errors: 2, subrequests: 300 }, dimensions: { date: "2026-09-30" } },
        { sum: { requests: 50, errors: 0, subrequests: 10 }, dimensions: { date: "2026-09-30" } },
        { sum: { requests: 7, errors: 0, subrequests: 1 }, dimensions: { date: "2026-09-24" } }
      ] }] } } });
      // sortieren geht nur nach einer abgefragten Dimension
      expect(q).toMatch(/orderBy: \[datetime_DESC\]\) \{ max \{[^}]*\} dimensions \{ datetime \} \}/);
      return ok({ data: { viewer: { accounts: [{
        r2StorageAdaptiveGroups: [{ max: { payloadSize: 1000, metadataSize: 24, objectCount: 3 } }],
        r2OperationsAdaptiveGroups: [{ sum: { requests: 5 }, dimensions: { actionType: "PutObject" } }, { sum: { requests: 9 }, dimensions: { actionType: "GetObject" } }]
      }] } } });
    }) as unknown as typeof fetch;
    const r = await usageReport({ CF_ACCOUNT_ID: "acc", CF_API_TOKEN: "tok", USAGE: dataset() }, {}, f, NOW);
    expect(r.errors).toEqual({});
    expect(calls.filter(c => c.endsWith("/graphql"))).toHaveLength(2);
    expect(r.worker).toEqual({ requests: [7, 0, 0, 0, 0, 0, 150], errors: [0, 0, 0, 0, 0, 0, 2], subrequests: [1, 0, 0, 0, 0, 0, 310] });
    expect(r.r2).toEqual({ bytes: 1024, objects: 3, classA: 5, classB: 9 });
    expect(r.series).toEqual([
      { kind: "api", name: "generativelanguage.googleapis.com", detail: "gemini-3.8-flash", byDay: [0, 0, 0, 0, 0, 3, 12] },
      { kind: "route", name: "flights", detail: "", byDay: [0, 0, 0, 0, 0, 0, 4] }
    ]);
  });

  it("fällt eine Quelle aus, kommen die anderen trotzdem", async () => {
    const f = (async (url: string, init: RequestInit) => {
      if (url.endsWith("/analytics_engine/sql")) return new Response("kaputt", { status: 500 });
      const q = JSON.parse(String(init.body)).query as string;
      if (q.includes("r2Storage")) return ok({ data: null, errors: [{ message: "unknown field" }] });
      return ok({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } } });
    }) as unknown as typeof fetch;
    const r = await usageReport({ CF_ACCOUNT_ID: "acc", CF_API_TOKEN: "tok", USAGE: dataset() }, {}, f, NOW);
    expect(r.worker?.requests).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.errors.r2).toBe("unknown field");
    expect(r.errors.own).toContain("500");
  });
});
