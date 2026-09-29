/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { callGemini, geminiCaller, pickModels } from "./gemini";

/** Antworten der Reihe nach; merkt sich Modell und Wartezeiten */
function net(statuses: number[]) {
  const seen: string[] = [];
  const waits: number[] = [];
  let i = 0;
  const f = (async (url: string) => {
    seen.push(url.split("/models/")[1].split(":")[0]);
    const s = statuses[Math.min(i++, statuses.length - 1)];
    return new Response(JSON.stringify(s === 200 ? { ok: true } : { error: { message: `Fehler ${s}` } }), { status: s });
  }) as typeof fetch;
  return { f, seen, waits, sleep: async (ms: number) => { waits.push(ms); } };
}

describe("Gemini-Aufruf mit Wiederholung", () => {
  it("überlastet: nach 1 und 3 Sekunden erneut, dann klappt es", async () => {
    const n = net([503, 503, 200]);
    let calls = 0;
    expect(await callGemini({}, { key: "k", models: ["a"], f: n.f, sleep: n.sleep, onCall: () => calls++ })).toEqual({ ok: true });
    expect(n.waits).toEqual([1000, 3000]);
    expect(calls).toBe(3);
  });
  it("weiter überlastet: Ausweichmodell springt ein", async () => {
    const n = net([503, 503, 503, 200]);
    await callGemini({}, { key: "k", models: ["a", "b"], f: n.f, sleep: n.sleep });
    expect(n.seen).toEqual(["a", "a", "a", "b"]);
  });
  it("Modell gibt es nicht mehr: gleich das nächste; ohne Ausweichmodell die Meldung von Google", async () => {
    const n = net([404, 200]);
    await callGemini({}, { key: "k", models: ["alt", "neu"], f: n.f, sleep: n.sleep });
    expect(n.seen).toEqual(["alt", "neu"]);
    await expect(callGemini({}, { key: "k", models: ["alt", ""], f: net([404]).f, sleep: n.sleep })).rejects.toThrow("KI-Fehler 404 (alt): Fehler 404");
  });
  it("alle genannten überlastet: weiteres Flash-Modell aus Googles Liste; nächste Runde gleich dieses", async () => {
    const n = net([503, 503, 503, 200, 200]);
    const call = geminiCaller({ key: "k", models: ["a", ""], f: n.f, sleep: n.sleep, discover: async () => ["b"] });
    await call({});
    expect(n.seen).toEqual(["a", "a", "a", "b"]);
    await call({});
    expect(n.seen.at(-1)).toBe("b");
    expect(n.seen).toHaveLength(5);
  });
  it("Auswahl aus Googles Liste: nur Text-Flash-Modelle, neueste zuerst, ohne das überlastete", () => {
    const list = [
      { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-flash-lite", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-flash-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-pro", supportedGenerationMethods: ["generateContent"] },
      { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] }
    ];
    expect(pickModels(list, ["gemini-3.8-flash"])).toEqual(["gemini-3.8-flash-lite", "gemini-3.5-flash"]);
  });
  it("anderer Fehler (z. B. Schlüssel ungültig): sofort abbrechen", async () => {
    const n = net([400, 200]);
    await expect(callGemini({}, { key: "k", models: ["a", "b"], f: n.f, sleep: n.sleep })).rejects.toThrow("KI-Fehler 400");
    expect(n.seen).toEqual(["a"]);
  });
});
