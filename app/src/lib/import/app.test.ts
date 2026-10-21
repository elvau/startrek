import { describe, expect, it, vi } from "vitest";

vi.mock("../flights/app", () => ({ FLIGHTS_URL: "https://x.test" }));
vi.mock("../cloud/cloud.svelte", () => ({ idToken: async () => "tok" }));
vi.mock("../bugs/log", () => ({ noteError: () => {} }));

import { askImport, ImportError } from "./app";

const reply = (status: number, body: object) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("askImport bei Fehlern des Dienstes", () => {
  it("KI überlastet (503): Fehler ist erneut versuchbar", async () => {
    reply(503, { error: "KI-Fehler 503 (m)", overloaded: true });
    const e = await askImport({ prepared: [] }).catch(x => x);
    expect(e).toBeInstanceOf(ImportError);
    expect(e.overloaded).toBe(true);
  });
  it("anderer Fehler (502): nicht als überlastet markiert", async () => {
    reply(502, { error: "KI-Fehler 500" });
    const e = await askImport({ prepared: [] }).catch(x => x);
    expect(e.overloaded).toBe(false);
  });
});
