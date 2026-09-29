/*
 * Such-Dienst der Reisekasse (Cloudflare Worker).
 * Fragt Flug- und Unterkunfts-Anbieter gleichzeitig ab und gibt eine zusammengeführte Liste zurück.
 * Schlüssel der Anbieter liegen als Cloudflare-Secrets, nie im Code oder in der App.
 */
import { parseQuery, searchAll, type FlightEnv } from "../../app/src/lib/flights/search";
import { parseStayQuery, searchStays, type StayEnv } from "../../app/src/lib/stays/search";
import type { FlightQuery } from "../../app/src/lib/flights/types";
import type { StayQuery } from "../../app/src/lib/stays/types";
import { runAgent } from "../../app/src/lib/agent/agent";
import { verifyIdToken } from "../../app/src/lib/agent/auth";
import { parseAgentRequest } from "../../app/src/lib/agent/types";
import { parseEventQuery, searchEvents } from "../../app/src/lib/events/search";
import type { EventEnv } from "../../app/src/lib/events/types";
import { bugImage, reportBug, type BugEnv } from "./bugs";
import { agentBudget } from "./budget";

interface Env extends FlightEnv, StayEnv, EventEnv, BugEnv {
  /** erlaubte Herkünfte, kommagetrennt */
  ALLOWED_ORIGINS?: string;
  /** KI-Reiseplaner: Schlüssel aus Google AI Studio (Secret); fehlt er, ist der Planer aus */
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  /** Anfragen pro Nutzer und Tag (Standard 5) */
  AGENT_DAILY?: string;
  FIREBASE_PROJECT_ID?: string;
  /** optional: KV-Speicher für das Tageslimit; ohne ihn zählt der Zwischenspeicher je Rechenzentrum */
  AGENT_KV?: KVNamespace;
}

const DEFAULT_ORIGINS = "https://elvau.github.io,https://splitandfly.com,https://www.splitandfly.com,https://startrek-1b6a7.web.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173";

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(s => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "86400", vary: "origin" };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    const h = cors(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { status: h["access-control-allow-origin"] ? 204 : 403, headers: h });

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, dienst: "Reisekasse Flugsuche" }, 200, h);
    }

    const route = url.pathname === "/flights/search" ? "flights" : url.pathname === "/stays/search" ? "stays" : null;
    if (route && req.method === "POST") {
      // nur von der eigenen Seite (Browser schicken Origin immer mit)
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
      const q = route === "flights" ? parseQuery(body) : parseStayQuery(body);
      if (typeof q === "string") return json({ error: q }, 400, h);

      // gleiche Suche 10 Minuten aus dem Zwischenspeicher
      const key = new Request(`https://cache.reisekasse/${route}?` + encodeURIComponent(JSON.stringify(q)));
      const cache = caches.default;
      const hit = await cache.match(key);
      if (hit) return json(await hit.json(), 200, { ...h, "x-cache": "hit" });

      const result = route === "flights" ? await searchAll(q as FlightQuery, env) : await searchStays(q as StayQuery, env);
      if (result.offers.length) {
        ctx.waitUntil(cache.put(key, new Response(JSON.stringify(result), { headers: { "content-type": "application/json", "cache-control": "max-age=600" } })));
      }
      return json(result, 200, { ...h, "x-cache": "miss" });
    }

    if (url.pathname === "/events/search" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
      const q = parseEventQuery(body);
      if (typeof q === "string") return json({ error: q }, 400, h);
      const result = await cachedJson(`events/${encodeURIComponent(JSON.stringify(q))}`, 3600, () => searchEvents(q, env, fetch, cachedJson), r => r.events.length > 0, ctx);
      return json(result, 200, h);
    }

    if (url.pathname === "/agent" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      return agent(req, env, h);
    }

    if (url.pathname === "/bug" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      return reportBug(req, env, h, json, (uid, kind) => countToday(env, uid, kind));
    }
    if (url.pathname.startsWith("/bug-image/") && req.method === "GET") return bugImage(url.pathname, env);

    return json({ error: "Nicht gefunden" }, 404, h);
  }
};

/* ---------- KI-Reiseplaner (Gemini) ---------- */

const DEFAULT_MODEL = "gemini-2.5-flash";

/** Tageszähler je Nutzer: im KV-Speicher, sonst im Zwischenspeicher des Rechenzentrums */
async function countToday(env: Env, uid: string, kind = "agent"): Promise<{ used: number; bump: () => Promise<void> }> {
  const day = new Date().toISOString().slice(0, 10);
  if (env.AGENT_KV) {
    const k = `${kind}:${uid}:${day}`;
    const used = Number(await env.AGENT_KV.get(k)) || 0;
    return { used, bump: () => env.AGENT_KV!.put(k, String(used + 1), { expirationTtl: 2 * 86400 }) };
  }
  const k = new Request(`https://quota.splitandfly/${kind === "agent" ? "" : kind + "/"}${encodeURIComponent(uid)}/${day}`);
  const hit = await caches.default.match(k);
  const used = hit ? Number(await hit.text()) || 0 : 0;
  return { used, bump: () => caches.default.put(k, new Response(String(used + 1), { headers: { "cache-control": "max-age=172800" } })) };
}

async function agent(req: Request, env: Env, h: Record<string, string>): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ error: "Der KI-Planer ist noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden, um den KI-Planer zu nutzen" }, 401, h);
  let uid: string;
  try { uid = await verifyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7"); }
  catch (e) { console.log(JSON.stringify({ at: "agent", status: 401, error: (e as Error).message })); return json({ error: (e as Error).message }, 401, h); }

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
  const r = parseAgentRequest(body);
  if (typeof r === "string") return json({ error: r }, 400, h);

  const limit = Number(env.AGENT_DAILY) || 5;
  const quota = await countToday(env, uid);
  if (quota.used >= limit) return json({ error: `Tageslimit erreicht (${limit} Anfragen). Morgen geht es weiter.`, remaining: 0 }, 429, h);

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  // Cloudflare (kostenloser Tarif): höchstens 50 ausgehende Anfragen pro Aufruf. Eine Flugsuche braucht bis zu 9
  // (Kiwi 3, Travelpayouts je Flughafenpaar 1), eine Unterkunftssuche 3; für Gemini bleiben immer RESERVE frei.
  const budget = agentBudget();
  const gemini = async (payload: object) => {
    budget.used++;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! }, body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    if (res.status === 429) throw new Error("Die KI ist gerade ausgelastet. Bitte in ein paar Minuten noch einmal versuchen.");
    if (!res.ok) throw new Error(`KI-Fehler ${res.status}${data.error?.message ? `: ${data.error.message}` : ""}`);
    return data;
  };
  try {
    const result = await runAgent(r, { gemini, flights: q => searchAll(q, env, budget.fetch), stays: q => searchStays(q, env, budget.fetch), canSearch: budget.canSearch });
    // eine Rückfrage zählt nicht gegen das Tageslimit, erst die Suche danach
    if (result.question) return json({ ...result, remaining: Math.max(0, limit - quota.used) }, 200, h);
    await quota.bump();
    return json({ ...result, remaining: Math.max(0, limit - quota.used - 1) }, 200, h);
  } catch (e) {
    // in den Workers-Logs sichtbar (Observability), die App zeigt nur eine übersetzte Meldung
    console.log(JSON.stringify({ at: "agent", model, error: (e as Error).message }));
    await quota.bump();
    return json({ error: (e as Error).message, remaining: Math.max(0, limit - quota.used - 1) }, 502, h);
  }
}

/** JSON im Zwischenspeicher des Rechenzentrums (z. B. Mannschaftslisten für eine Woche) */
async function cachedJson<T>(key: string, ttlSec: number, load: () => Promise<T>, keep: (v: T) => boolean = () => true, ctx?: ExecutionContext): Promise<T> {
  const k = new Request(`https://cache.splitandfly/${key}`);
  const hit = await caches.default.match(k);
  if (hit) return (await hit.json()) as T;
  const v = await load();
  if (keep(v)) {
    const put = caches.default.put(k, new Response(JSON.stringify(v), { headers: { "content-type": "application/json", "cache-control": `max-age=${ttlSec}` } }));
    if (ctx) ctx.waitUntil(put); else await put;
  }
  return v;
}
