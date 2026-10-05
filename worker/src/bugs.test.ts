/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it, vi } from "vitest";

const fake = async (t: string) => { if (t !== "gut") throw new Error("Anmeldung ungültig"); return "uid-anna-123456"; };
vi.mock("../../app/src/lib/agent/auth", () => ({ verifyIdToken: fake, verifyAnyIdToken: fake }));
const { reportBug, bugImage, sniff } = await import("./bugs");

const json = (body: unknown, status: number, headers: Record<string, string>) => new Response(JSON.stringify(body), { status, headers });
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const report = { text: "Summe falsch bei drei Personen", page: "https://x.test/", lang: "de", ua: "Test", screen: "1×1", version: "abc", errors: [], view: "Reise" };

function setup(used = 0) {
  const store = new Map<string, { body: Uint8Array; type: string }>();
  const bucket = {
    put: async (k: string, b: Uint8Array, o: { httpMetadata: { contentType: string } }) => { store.set(k, { body: b, type: o.httpMetadata.contentType }); },
    get: async (k: string) => { const x = store.get(k); return x ? { body: x.body, httpMetadata: { contentType: x.type } } : null; }
  } as unknown as R2Bucket;
  const issues: { url: string; body: { title: string; body: string } }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => { issues.push({ url, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ number: 7 }), { status: 201 }); }) as typeof fetch;
  let bumped = 0;
  const count = async () => ({ used, bump: async () => { bumped++; } });
  const env = { BUG_REPO: "elvau/bugs", GITHUB_TOKEN: "t", BUG_BUCKET: bucket };
  const req = (token: string, image?: Uint8Array) => {
    const f = new FormData();
    f.set("report", JSON.stringify(report));
    if (image) f.set("image", new Blob([image], { type: "image/jpeg" }), "a.jpg");
    return new Request("https://worker.test/bug", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: f });
  };
  return { env, req, count, issues, store, bumped: () => bumped };
}

describe("Fehlermeldungen im Such-Dienst", () => {
  it("erkennt Bilder an den ersten Bytes", () => {
    expect(sniff(JPG)).toBe("image/jpeg");
    expect(sniff(new TextEncoder().encode("<svg>"))).toBeNull();
  });
  it("Meldung mit Bild: Bild im Speicher, Issue mit Link, Zähler erhöht", async () => {
    const s = setup();
    const res = await reportBug(s.req("gut", JPG), s.env, {}, json, s.count);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, number: 7, remaining: 4 });
    expect(s.issues[0].url).toBe("https://api.github.com/repos/elvau/bugs/issues");
    const key = [...s.store.keys()][0];
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(s.issues[0].body.body).toContain(`https://worker.test/bug-image/${key}`);
    expect(s.issues[0].body.body).toContain("Konto uid-anna…");
    expect(s.bumped()).toBe(1);
    const img = await bugImage(`/bug-image/${key}`, s.env);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect((await bugImage("/bug-image/../geheim.jpg", s.env)).status).toBe(404);
  });
  it("ohne Anmeldung, falsches Bild, Tageslimit, nicht eingerichtet", async () => {
    let s = setup();
    expect((await reportBug(s.req("falsch"), s.env, {}, json, s.count)).status).toBe(401);
    expect((await reportBug(s.req("gut", new TextEncoder().encode("<svg onload=x>")), s.env, {}, json, s.count)).status).toBe(415);
    s = setup(5);
    expect((await reportBug(s.req("gut"), s.env, {}, json, s.count)).status).toBe(429);
    expect(s.issues).toHaveLength(0);
    expect((await reportBug(s.req("gut"), {}, {}, json, s.count)).status).toBe(503);
  });
});
