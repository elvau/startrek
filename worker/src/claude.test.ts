/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { claudeCaller, fromClaude, toClaude, toSchema } from "./claude";
import { isOverloaded } from "./gemini";
import { kiCaller, kiModels } from "./ki";
import { runAgent } from "../../app/src/lib/agent/agent";
import { setupFromGemini, setupPayload } from "../../app/src/lib/setup/ai";
import type { AgentRequest } from "../../app/src/lib/agent/types";
import type { FlightOffer } from "../../app/src/lib/flights/types";
import type { StayOffer } from "../../app/src/lib/stays/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Antworten von Anthropic der Reihe nach (Status, Inhalt); merkt sich die Anfragen */
function net(replies: { status?: number; body: object }[]) {
  const sent: any[] = [];
  let i = 0;
  const f = (async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const r = replies[Math.min(i++, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, sent };
}
const msg = (content: object[], stop = "tool_use") => ({ body: { content, stop_reason: stop } });
const tool = (id: string, name: string, input: object) => ({ type: "tool_use", id, name, input });
const thinking = { type: "thinking", thinking: "", signature: "sig-1" };
const noWait = async () => {};

describe("Claude: Übersetzung aus dem Gemini-Format", () => {
  it("Schema mit Typen in Kleinbuchstaben, verschachtelt", () => {
    expect(toSchema({ type: "OBJECT", properties: { a: { type: "ARRAY", items: { type: "INTEGER" } }, b: { type: "STRING", enum: ["x"] } }, required: ["a"] }))
      .toEqual({ type: "object", properties: { a: { type: "array", items: { type: "integer" } }, b: { type: "string", enum: ["x"] } }, required: ["a"] });
  });

  it("Systemtext, Werkzeuge, frei wählbares Werkzeug und Zwischenspeicher", () => {
    const b = toClaude({ systemInstruction: { parts: [{ text: "Sys" }] }, contents: [{ role: "user", parts: [{ text: "Hallo" }] }], tools: [{ functionDeclarations: [{ name: "t", description: "d", parameters: { type: "OBJECT", properties: {} } }] }], toolConfig: { functionCallingConfig: { mode: "ANY" } } }, "m");
    expect(b).toMatchObject({ model: "m", system: "Sys", messages: [{ role: "user", content: [{ type: "text", text: "Hallo" }] }], tools: [{ name: "t", description: "d", input_schema: { type: "object", properties: {} } }], tool_choice: { type: "auto" }, cache_control: { type: "ephemeral" } });
    expect(b.temperature).toBeUndefined();
  });

  it("nur ein erlaubtes Werkzeug: genau dieses (Kontoeinrichtung, letzte Runde)", () => {
    expect(toClaude(setupPayload("Wir sind zwei Erwachsene"), "m").tool_choice).toEqual({ type: "tool", name: "fill_profile" });
  });

  it("Verlauf: rohe Blöcke mit Denkblock unverändert, Ergebnisse mit passenden Kennungen vor dem Text", () => {
    const raw = [thinking, tool("toolu_a", "search_flights", { from: ["DUS"] }), tool("toolu_b", "search_stays", { place: "Palma" })];
    const model = fromClaude({ content: raw }).candidates[0].content;
    const b = toClaude({ contents: [
      { role: "user", parts: [{ text: "Wunsch" }] },
      model,
      { role: "user", parts: [{ functionResponse: { name: "search_flights", response: { result: { offers: [] } } } }, { functionResponse: { name: "search_stays", response: { result: { offers: [1] } } } }, { text: "Jetzt vorschlagen" }] }
    ] }, "m");
    expect(b.messages[1]).toEqual({ role: "assistant", content: raw });
    expect(b.messages[2].content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_a", content: JSON.stringify({ result: { offers: [] } }) },
      { type: "tool_result", tool_use_id: "toolu_b", content: JSON.stringify({ result: { offers: [1] } }) },
      { type: "text", text: "Jetzt vorschlagen" }
    ]);
  });

  it("Antwort: Werkzeugaufrufe und Text als Gemini-Teile, Denkblöcke nur in den rohen Blöcken", () => {
    const res = fromClaude({ content: [thinking, { type: "text", text: "Moment" }, tool("x", "ask_user", { question: "Wann?" })] });
    expect(res.candidates[0].content.parts).toEqual([{ text: "Moment" }, { functionCall: { name: "ask_user", args: { question: "Wann?" } } }]);
  });
});

describe("Claude-Aufruf", () => {
  it("überlastet (529): nach 1 und 3 Sekunden erneut; bleibt es so, Meldung wie bei Gemini", async () => {
    const waits: number[] = [];
    const n = net([{ status: 529, body: { error: { message: "Overloaded" } } }]);
    const call = claudeCaller({ key: "k", f: n.f, sleep: async ms => { waits.push(ms); } });
    const err = await call({ contents: [{ role: "user", parts: [{ text: "x" }] }] }).catch(e => e as Error);
    expect(waits).toEqual([1000, 3000]);
    expect(err.message).toBe("KI-Fehler 503 (claude-haiku-5-5): Overloaded");
    expect(isOverloaded(err.message)).toBe(true);
  });
  it("Schlüssel falsch (401): sofort abbrechen", async () => {
    const n = net([{ status: 401, body: { error: { message: "invalid x-api-key" } } }, msg([])]);
    await expect(claudeCaller({ key: "k", f: n.f, sleep: noWait })({})).rejects.toThrow("KI-Fehler 401");
    expect(n.sent).toHaveLength(1);
  });
  it("Ablehnung durch die Sicherheitsprüfung ist ein Fehler", async () => {
    const n = net([msg([], "refusal")]);
    await expect(claudeCaller({ key: "k", f: n.f })({})).rejects.toThrow("abgelehnt");
  });
  it("Kontoeinrichtung: Felder aus dem Werkzeugaufruf", async () => {
    const n = net([msg([tool("t1", "fill_profile", { adults: 2, pet: true })])]);
    const res = await claudeCaller({ key: "k", f: n.f })(setupPayload("Zwei Erwachsene mit Hund"));
    expect(setupFromGemini(res)).toMatchObject({ adults: 2, pet: true });
  });
});

describe("Planer mit Claude", () => {
  const req: AgentRequest = { prompt: "2 Erwachsene, Mai, Mallorca", lang: "de", today: "2027-04-01", origins: ["DUS"], adults: 2, childAges: [], infants: 0 };
  const leg = (from: string, to: string, dep: string, arr: string) => ({ from, to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["EW"], flights: ["EW1"] });
  const flight: FlightOffer = { id: "f1", source: "kiwi", sourceName: "Kiwi.com", price: 300, currency: "EUR", out: leg("DUS", "PMI", "2027-05-10T08:00", "2027-05-10T10:30"), back: leg("PMI", "DUS", "2027-05-13T18:00", "2027-05-13T20:30") };
  const stay: StayOffer = { id: "s1", source: "booking", sourceName: "Booking.com", name: "Hotel", total: 400, currency: "EUR", score: 8.5 };

  it("sucht, schickt Denkblöcke und Ergebnisse zurück und schlägt vor", async () => {
    const round1 = [thinking, tool("toolu_1", "search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13" }), tool("toolu_2", "search_stays", { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-13" })];
    const n = net([msg(round1), msg([tool("toolu_3", "propose_trips", { trips: [{ title: "Mallorca", summary: "Sonne", place: "Palma", from: "2027-05-10", to: "2027-05-13", flightId: "f1", stayId: "s1" }] })])]);
    const res = await runAgent(req, {
      gemini: claudeCaller({ key: "k", f: n.f }),
      flights: async () => ({ offers: [flight], sources: [] }),
      stays: async () => ({ offers: [stay], sources: [] })
    });
    expect(res.trips[0]).toMatchObject({ title: "Mallorca", total: 700 });
    // zweite Runde: gleicher Anfang, Antwort der ersten Runde unverändert, Ergebnisse zu toolu_1 und toolu_2
    const [a, b] = n.sent;
    expect(b.system).toBe(a.system);
    expect(b.tools).toEqual(a.tools);
    expect(b.messages[0]).toEqual(a.messages[0]);
    expect(b.messages[1]).toEqual({ role: "assistant", content: round1 });
    expect(b.messages[2].content.map((c: any) => c.tool_use_id)).toEqual(["toolu_1", "toolu_2"]);
    expect(JSON.parse(b.messages[2].content[0].content).result.offers[0]).toMatchObject({ id: "f1", price: 300 });
  });
});

describe("Anbieterwahl", () => {
  const gem = (status: number) => (async () => new Response(JSON.stringify(status === 200 ? { from: "gemini" } : { error: { message: "x" } }), { status })) as unknown as typeof fetch;
  /** Anthropic und Google an der Adresse unterscheiden */
  function both(claude: number, gemini: number) {
    const hosts: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const host = new URL(url).host;
      hosts.push(host);
      return host === "api.anthropic.com"
        ? new Response(JSON.stringify(claude === 200 ? { content: [{ type: "text", text: "claude" }], stop_reason: "end_turn" } : { error: { message: "x" } }), { status: claude })
        : gem(gemini)(url, init);
    }) as typeof fetch;
    return { f, hosts };
  }
  const env = { ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", GEMINI_MODEL: "gm" };

  it("Reihenfolge: Claude, dann Gemini", () => {
    expect(kiModels(env)).toEqual(["claude-haiku-5-5", "gm"]);
    expect(kiModels({ GEMINI_API_KEY: "g" })).toEqual(["gemini-3.8-flash"]);
  });
  it("Claude überlastet: Gemini springt ein und bleibt für die Anfrage", async () => {
    const n = both(529, 200);
    const call = kiCaller(env, { f: n.f, sleep: noWait });
    expect(await call({})).toEqual({ from: "gemini" });
    await call({});
    expect(n.hosts.filter(h => h === "api.anthropic.com")).toHaveLength(3);
    expect(n.hosts.at(-1)).toBe("generativelanguage.googleapis.com");
  });
  it("Claude antwortet: Gemini wird nicht gefragt", async () => {
    const n = both(200, 200);
    const res = await kiCaller(env, { f: n.f })({}) as any;
    expect(res.candidates[0].content.parts[0].text).toBe("claude");
    expect(n.hosts).toEqual(["api.anthropic.com"]);
  });
  it("Guthaben leer oder Ausgabenlimit erreicht: Gemini springt ein", async () => {
    for (const [status, message] of [[400, "Your credit balance is too low to access the Anthropic API."], [400, "You have reached your specified API usage limits."], [402, "billing"]] as const) {
      const hosts: string[] = [];
      const f = (async (url: string, init?: RequestInit) => {
        const host = new URL(url).host;
        hosts.push(host);
        return host === "api.anthropic.com" ? new Response(JSON.stringify({ error: { message } }), { status }) : gem(200)(url, init);
      }) as typeof fetch;
      expect(await kiCaller(env, { f, sleep: noWait })({})).toEqual({ from: "gemini" });
      expect(hosts).toEqual(["api.anthropic.com", "generativelanguage.googleapis.com"]);
    }
  });
  it("Anfrage ungültig (400): kein Wechsel", async () => {
    const n = both(400, 200);
    await expect(kiCaller(env, { f: n.f })({})).rejects.toThrow("KI-Fehler 400");
    expect(n.hosts).toEqual(["api.anthropic.com"]);
  });
});
