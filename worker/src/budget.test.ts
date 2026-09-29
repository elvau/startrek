/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { agentBudget } from "./budget";
import { runAgent } from "../../app/src/lib/agent/agent";
import { searchAll } from "../../app/src/lib/flights/search";
import { searchStays } from "../../app/src/lib/stays/search";
import type { AgentRequest } from "../../app/src/lib/agent/types";

const req: AgentRequest = { prompt: "Eine Woche Strandurlaub mit Kindern in den Sommerferien", lang: "de", today: "2027-01-10", origins: ["DUS", "CGN", "NRN"], adults: 2, childAges: [6, 9], infants: 0 };
const env = { TRAVELPAYOUTS_TOKEN: "t" };

/** Gemini sucht, solange es darf: je Runde zwei Flugsuchen (3 × 2 Flughäfen) und eine Unterkunft, erst am Ende der Vorschlag */
async function run(withBudget: boolean) {
  let calls = 1; // Anmeldeprüfung
  // jede ausgehende Anfrage zählt; alle antworten leer, aber erfolgreich (MCP macht dann alle drei Schritte)
  const net = (async () => { calls++; return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); }) as typeof fetch;
  const b = agentBudget(48, 6, 9, net);
  let round = 0;
  const gemini = async () => {
    calls++; b.used++; round++;
    if (round >= 8) return { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "propose_trips", args: { trips: [] } } }] } }] };
    const f = { name: "search_flights", args: { from: ["DUS", "CGN", "NRN"], to: ["PMI", "AYT"], depart: "2027-07-10", return: "2027-07-17" } };
    const s = { name: "search_stays", args: { place: "Palma", checkin: "2027-07-10", checkout: "2027-07-17" } };
    return { candidates: [{ content: { role: "model", parts: [{ functionCall: f }, { functionCall: f }, { functionCall: s }] } }] };
  };
  const fx = withBudget ? b.fetch : net;
  await runAgent(req, { gemini, flights: q => searchAll(q, env, fx), stays: q => searchStays(q, {}, fx), ...(withBudget ? { canSearch: b.canSearch } : {}) });
  return { calls, round };
}

describe("Anfragelimit des KI-Planers (Cloudflare: 50 pro Aufruf)", () => {
  it("ohne Zähler wären es mehr als 50 Anfragen, mit Zähler bleibt Platz für alle Gemini-Runden", async () => {
    expect((await run(false)).calls).toBeGreaterThan(50);
    const r = await run(true);
    expect(r.calls).toBeLessThanOrEqual(50);
    expect(r.round).toBe(8);
  });
});
