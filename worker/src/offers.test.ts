/* Läuft mit den Tests der App (cd app && npx vitest run) */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { mcpOfferStore, offerStore } from "./offers";
import type { ImportedOffer } from "../../app/src/lib/import/ai";

/** nachgestellter Firestore-Emulator: commit schreibt, GET liest */
function fakeFs() {
  const docs = new Map<string, Record<string, unknown>>();
  const f = (async (url: string, init?: RequestInit) => {
    const path = decodeURIComponent(new URL(url).pathname).replace(/^\/v1\//, "");
    if (path.endsWith(":commit")) {
      for (const w of JSON.parse(String(init?.body)).writes) { if (w.delete) docs.delete(w.delete); else docs.set(w.update.name, w.update); }
      return new Response("{}");
    }
    if (path.endsWith(":runQuery")) {
      const q = JSON.parse(String(init?.body)).structuredQuery;
      const col = q.from[0].collectionId, before = q.where.fieldFilter.value.timestampValue;
      const hits = [...docs.values()].filter((d: any) => d.name.split("/").at(-2) === col && d.fields.expiresAt.timestampValue < before);
      return new Response(JSON.stringify(hits.map(document => ({ document }))));
    }
    const d = docs.get(path);
    return d ? new Response(JSON.stringify(d)) : new Response(JSON.stringify({ error: { message: "nf" } }), { status: 404 });
  }) as typeof fetch;
  return { f, docs };
}
const env = { FIRESTORE_EMULATOR: "http://127.0.0.1:8080", FIREBASE_PROJECT_ID: "demo" };
const o: ImportedOffer = { kind: "flight", place: "Rom", from: "2027-03-01", price: { perPerson: 99 }, flights: { legs: [{ dir: "out", from: "DUS", to: "FCO" }] } };
const req = { url: "https://example.com/rom", files: [], lang: "de" };

describe("Angebotsspeicher im Such-Dienst (#462)", () => {
  it("speichert Angebot und Eingabe, findet sie bis zum Ablauf wieder", async () => {
    const { f, docs } = fakeFs();
    const s = offerStore(env, f)!;
    expect(await s.find(req, "2026-10-20")).toBeNull();
    await s.save(req, o, "2026-10-20");
    expect([...docs.keys()].map(k => k.split("/").at(-2))).toEqual(["offers", "offerInputs"]);
    const offer = [...docs.values()][0] as { fields: Record<string, { stringValue?: string; timestampValue?: string }> };
    expect(offer.fields.expiresAt.timestampValue).toBe("2026-11-03T23:59:59Z");
    expect(await s.find({ ...req, url: "https://example.com/rom?utm_source=x" }, "2026-10-21")).toEqual({ offer: o, until: "2026-11-03" });
    expect(await s.find(req, "2026-11-04")).toBeNull();
  });
  it("Teilnehmerlisten und abgelaufene Angebote werden nicht gespeichert; ohne Dienstkonto kein Speicher", async () => {
    const { f, docs } = fakeFs();
    const s = offerStore(env, f)!;
    await s.save(req, { ...o, travelers: [{ name: "Anna" }] }, "2026-10-20");
    await s.save(req, { ...o, validUntil: "2026-10-01" }, "2026-10-20");
    expect(docs.size).toBe(0);
    expect(offerStore({})).toBeNull();
  });
  it("täglich aufräumen: nur Abgelaufenes in beiden Sammlungen löschen", async () => {
    const { f, docs } = fakeFs();
    const s = offerStore(env, f)!;
    await s.save(req, o, "2026-10-20");
    await s.save({ ...req, url: "https://example.com/paris" }, { ...o, place: "Paris", validUntil: "2026-10-21" }, "2026-10-20");
    expect(docs.size).toBe(4);
    expect(await s.sweep(new Date("2026-10-25T00:00:00Z"))).toBe(2);
    expect(docs.size).toBe(2);
    expect(await s.find(req, "2026-10-25")).not.toBeNull();
  });
  it("Suchergebnisse des Konnektors: je Schlüssel, über Rechenzentren hinweg, mit Ablauf und Aufräumen", async () => {
    const { f, docs } = fakeFs();
    const s = mcpOfferStore<{ kind: string; n: number }>(env, f, 6)!;
    await s.put("k1", [["a/1", { kind: "flight", n: 1 }], ["b", { kind: "stay", n: 2 }]]);
    expect(docs.size).toBe(2);
    expect([...docs.keys()].every(k => /\/mcpOffers\/[0-9a-f]{64}$/.test(k))).toBe(true);
    expect(await s.get("k1", "a/1")).toEqual({ kind: "flight", n: 1 });
    expect(await s.get("k2", "a/1")).toBeNull();
    expect(await s.get("k1", "c")).toBeNull();
    expect(await offerStore(env, f)!.sweep(new Date(Date.now() + 7 * 3600_000))).toBe(2);
    expect(await s.get("k1", "b")).toBeNull();
    expect(mcpOfferStore({})).toBeNull();
  });
});
