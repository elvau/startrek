/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it, vi } from "vitest";
import type { PricePoint } from "../../app/src/lib/catalog/prices";

const fake = async (t: string) => { if (t !== "gut") throw new Error("Anmeldung ungültig"); return "uid-anna-123456"; };
vi.mock("../../app/src/lib/agent/auth", () => ({ verifyIdToken: fake, verifyAnyIdToken: fake, requireVerified: () => {} }));
const { catalogPrice } = await import("./catalog");

const json = (body: unknown, status: number, headers: Record<string, string>) => new Response(JSON.stringify(body), { status, headers });
const req = (token: string, body: unknown) => new Request("https://worker.test/catalog/price", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

function setup() {
  const docs = new Map<string, PricePoint[]>();
  const store = { read: async (d: string) => docs.get(d) || [], write: async (d: string, p: PricePoint[]) => { docs.set(d, p); } };
  const used = new Map<string, number>();
  const count = async (uid: string, kind: string) => { const k = `${kind}:${uid}`; return { used: used.get(k) || 0, bump: async () => { used.set(k, (used.get(k) || 0) + 1); } }; };
  return { docs, store, count, used };
}
const body = { entry: "kat1abcd", points: [{ c: "stay", k: "Poreč", pp: 450, m: 6, n: 2 }, { c: "tour", k: "Bootstour", pp: 45, m: 6, n: 2 }, { c: "arrival", k: "2000", pp: 230, m: 6, n: 2 }] };

describe("Preispunkte für den Katalog (#652)", () => {
  it("nur angemeldet; Punkte je Eintrag, Anreise in der Tabelle, ohne Konto gespeichert", async () => {
    const s = setup();
    expect((await catalogPrice(req("", body), {}, {}, json, s.count, s.store)).status).toBe(401);
    expect((await catalogPrice(req("schlecht", body), {}, {}, json, s.count, s.store)).status).toBe(401);
    const res = await catalogPrice(req("gut", body), {}, {}, json, s.count, s.store, "2026-11-02");
    expect(res.status).toBe(200);
    expect(s.docs.get("kat1abcd")).toEqual([{ c: "stay", k: "Poreč", pp: 450, m: 6, n: 2, d: "2026-11-02" }, { c: "tour", k: "Bootstour", pp: 45, m: 6, n: 2, d: "2026-11-02" }]);
    expect(s.docs.get("_arrival")).toEqual([{ c: "arrival", k: "2000", pp: 230, m: 6, n: 2, d: "2026-11-02" }]);
    expect(JSON.stringify([...s.docs.values()])).not.toContain("uid-anna");
  });
  it("je Konto und Eintrag ein Mal am Tag, höchstens CATALOG_DAILY Einträge", async () => {
    const s = setup();
    await catalogPrice(req("gut", body), {}, {}, json, s.count, s.store);
    expect((await catalogPrice(req("gut", body), {}, {}, json, s.count, s.store)).status).toBe(429);
    const env = { CATALOG_DAILY: "2" };
    expect((await catalogPrice(req("gut", { ...body, entry: "kat2abcd" }), env, {}, json, s.count, s.store)).status).toBe(200);
    expect((await catalogPrice(req("gut", { ...body, entry: "kat3abcd" }), env, {}, json, s.count, s.store)).status).toBe(429);
  });
  it("ungültige Meldungen und fehlender Speicher", async () => {
    const s = setup();
    for (const b of [{}, { entry: "_arrival", points: body.points }, { entry: "kat1abcd", points: [] }, { entry: "kat1abcd", points: [{ c: "stay", k: "https://x.de", pp: 10, m: 6, n: 2 }] },
      { entry: "kat1abcd", points: [{ c: "arrival", k: "123", pp: 10, m: 6, n: 2 }] }, { entry: "kat1abcd", points: [{ c: "stay", k: "A", pp: 0, m: 6, n: 2 }] }])
      expect((await catalogPrice(req("gut", b), {}, {}, json, s.count, s.store)).status, JSON.stringify(b)).toBe(400);
    expect((await catalogPrice(req("gut", body), {}, {}, json, s.count, null)).status).toBe(503);
    expect(s.docs.size).toBe(0);
  });
});
