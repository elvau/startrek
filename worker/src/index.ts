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
import { parseActivityQuery, searchActivities } from "../../app/src/lib/activities/search";
import type { ActivityEnv } from "../../app/src/lib/activities/types";
import { bugImage, reportBug, type BugEnv } from "./bugs";
import { agentBudget } from "./budget";
import { geminiCaller } from "./gemini";
import { isAdmin, meter, noteRoute, usageReport, type UsageEnv } from "./usage";
import { checkLimit, searchWindows, type LimitEnv } from "./ratelimit";
import { issueKey, newKid, verifyKey, type KeyEnv } from "./apikey";
import { tripStore, type StoreEnv } from "./firestore";
import { mcpMessage, type Saved } from "./mcp";
import pkg from "../../app/package.json";
import { partnerOn } from "../../app/src/lib/partner";

interface Env extends FlightEnv, StayEnv, EventEnv, ActivityEnv, BugEnv, UsageEnv, LimitEnv, KeyEnv, StoreEnv {
  /** KI-Konnektor: Suchen pro Schlüssel und Tag (Standard 50) */
  MCP_DAILY?: string;
  /** erlaubte Herkünfte, kommagetrennt */
  ALLOWED_ORIGINS?: string;
  /** KI-Reiseplaner: Schlüssel aus Google AI Studio (Secret); fehlt er, ist der Planer aus */
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  /** optional: springt ein, wenn GEMINI_MODEL überlastet ist */
  GEMINI_FALLBACK_MODEL?: string;
  /** optional: Tagesgrenze des Gemini-Modells laut AI Studio, nur für die Admin-Ansicht */
  GEMINI_RPD?: string;
  /** Anfragen pro Nutzer und Tag (Standard 5) */
  AGENT_DAILY?: string;
  FIREBASE_PROJECT_ID?: string;
  /** optional: KV-Speicher für das Tageslimit; ohne ihn zählt der Zwischenspeicher je Rechenzentrum */
  AGENT_KV?: KVNamespace;
}

const SEARCHES = new Set(["/flights/search", "/stays/search", "/events/search", "/activities/search"]);

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

    // Suchen: höchstens so viele pro IP und Minute bzw. Stunde (schützt die Kontingente der Anbieter)
    if (req.method === "POST" && SEARCHES.has(url.pathname) && h["access-control-allow-origin"]) {
      const lim = await checkLimit(caches.default, req.headers.get("cf-connecting-ip"), searchWindows(env));
      if (!lim.ok) {
        noteRoute(env, "blocked");
        return json({ error: "Zu viele Suchen in kurzer Zeit, bitte kurz warten.", retryAfter: lim.retryAfter }, 429, { ...h, "retry-after": String(lim.retryAfter) });
      }
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
      // Partner-Schalter im Schlüssel: nach dem Umschalten keine Treffer mit alten Links
      const key = new Request(`https://cache.reisekasse/${route}${partnerOn(env) ? "/p" : ""}?` + encodeURIComponent(JSON.stringify(q)));
      const cache = caches.default;
      const hit = await cache.match(key);
      noteRoute(env, route, !!hit);
      if (hit) return json(await hit.json(), 200, { ...h, "x-cache": "hit" });

      const net = meter(env);
      const result = route === "flights" ? await searchAll(q as FlightQuery, env, net) : await searchStays(q as StayQuery, env, net);
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
      noteRoute(env, "events");
      const result = await cachedJson(`events/${encodeURIComponent(JSON.stringify(q))}`, 3600, () => searchEvents(q, env, meter(env), cachedJson), r => r.events.length > 0, ctx);
      return json(result, 200, h);
    }

    if (url.pathname === "/activities/search" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
      const q = parseActivityQuery(body);
      if (typeof q === "string") return json({ error: q }, 400, h);
      noteRoute(env, "activities");
      // Touren ändern sich selten: 6 Stunden aus dem Zwischenspeicher
      const result = await cachedJson(`activities${partnerOn(env) ? "/p" : ""}/${encodeURIComponent(JSON.stringify(q))}`, 6 * 3600, () => searchActivities(q, env, meter(env)), r => r.activities.length > 0, ctx);
      return json(result, 200, h);
    }

    if (url.pathname === "/agent" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      noteRoute(env, "agent");
      return agent(req, env, h);
    }

    if (url.pathname === "/bug" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      noteRoute(env, "bug");
      return reportBug(req, env, h, json, (uid, kind) => countToday(env, uid, kind), meter(env));
    }

    if (url.pathname === "/admin/usage" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      return admin(req, env, h);
    }
    if (url.pathname.startsWith("/bug-image/") && req.method === "GET") return bugImage(url.pathname, env);

    if (url.pathname === "/mcp/key" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      return mcpKey(req, env, h);
    }
    if (url.pathname === "/mcp") return mcp(req, env, ctx);

    return json({ error: "Nicht gefunden" }, 404, h);
  }
};

/* ---------- KI-Reiseplaner (Gemini) ---------- */

// ältere Modelle (gemini-2.5-flash) gibt Google neuen Konten nicht mehr; mit GEMINI_MODEL überschreibbar
const DEFAULT_MODEL = "gemini-3.8-flash";

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
  const net = meter(env);
  const budget = agentBudget(48, 8, 9, net);
  // überlastet: kurz warten und wiederholen, dann das Ausweichmodell
  const gemini = geminiCaller({ key: env.GEMINI_API_KEY!, models: [model, env.GEMINI_FALLBACK_MODEL || ""], f: net, onCall: () => { budget.used++; } });
  try {
    const result = await runAgent(r, { gemini, flights: q => searchAll(q, env, budget.fetch), stays: q => searchStays(q, env, budget.fetch), canSearch: budget.canSearch });
    // eine Rückfrage zählt nicht gegen das Tageslimit, erst die Suche danach
    if (result.question) return json({ ...result, remaining: Math.max(0, limit - quota.used) }, 200, h);
    await quota.bump();
    return json({ ...result, remaining: Math.max(0, limit - quota.used - 1) }, 200, h);
  } catch (e) {
    // in den Workers-Logs sichtbar (Observability), die App zeigt nur eine übersetzte Meldung
    console.log(JSON.stringify({ at: "agent", model, error: (e as Error).message }));
    // Fehler auf unserer Seite oder bei Gemini zählen nicht gegen das Tageslimit
    return json({ error: (e as Error).message, remaining: Math.max(0, limit - quota.used) }, 502, h);
  }
}

/* ---------- KI-Konnektor (MCP) ---------- */

/** persönlichen Schlüssel ausstellen (angemeldet, höchstens 3 pro Tag); der Such-Dienst speichert ihn nicht */
async function mcpKey(req: Request, env: Env, h: Record<string, string>): Promise<Response> {
  if (!env.MCP_KEY_SECRET) return json({ error: "Der KI-Konnektor ist noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden" }, 401, h);
  let uid: string;
  try { uid = await verifyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7"); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }
  const body = await req.json().catch(() => ({})) as { name?: unknown };
  const quota = await countToday(env, uid, "mcpkey");
  if (quota.used >= 3) return json({ error: "Höchstens 3 Schlüssel pro Tag" }, 429, h);
  await quota.bump();
  const kid = newKid();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const key = await issueKey(env.MCP_KEY_SECRET, { uid, kid, name, at: new Date().toISOString().slice(0, 10) });
  noteRoute(env, "mcpkey");
  return json({ key, kid, trips: !!tripStore(env) }, 200, h);
}

/** MCP über HTTP: eine JSON-RPC-Nachricht pro Anfrage, Antwort als JSON (kein Stream) */
async function mcp(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const plain = (status: number, msg: string, extra: Record<string, string> = {}) => json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: msg } }, status, extra);
  if (req.method !== "POST") return plain(405, "Nur POST", { allow: "POST" });
  // aus dem Browser nur von unseren Seiten (Schutz vor DNS-Rebinding); KI-Programme schicken keinen Origin mit
  const origin = req.headers.get("origin");
  if (origin && !cors(origin, env)["access-control-allow-origin"]) return plain(403, "Herkunft nicht erlaubt");
  if (!env.MCP_KEY_SECRET) return plain(503, "Der KI-Konnektor ist noch nicht eingerichtet");
  const user = await verifyKey(env, (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!user) return plain(401, "Schlüssel fehlt oder ist ungültig", { "www-authenticate": "Bearer" });
  let msg: unknown;
  try { msg = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, {}); }
  if (Array.isArray(msg)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch nicht unterstützt" } }, 400, {});
  noteRoute(env, "mcp");

  const net = meter(env);
  const ip = req.headers.get("cf-connecting-ip");
  const offerKey = (id: string) => new Request(`https://mcp.splitandfly/offer/${user.kid}/${encodeURIComponent(id)}`);
  const limit = Number(env.MCP_DAILY) || 50;
  const res = await mcpMessage(msg, user, {
    flights: q => searchAll(q, env, net),
    stays: q => searchStays(q, env, net),
    events: q => cachedJson(`events/${encodeURIComponent(JSON.stringify(q))}`, 3600, () => searchEvents(q, env, net, cachedJson), r => r.events.length > 0, ctx),
    activities: q => cachedJson(`activities${partnerOn(env) ? "/p" : ""}/${encodeURIComponent(JSON.stringify(q))}`, 6 * 3600, () => searchActivities(q, env, net), r => r.activities.length > 0, ctx),
    store: tripStore(env, net),
    offers: {
      put: (id, v) => caches.default.put(offerKey(id), new Response(JSON.stringify(v), { headers: { "cache-control": "max-age=21600" } })),
      get: async id => { const r = await caches.default.match(offerKey(id)); return r ? await r.json() as Saved : null; }
    },
    allowSearch: async () => {
      const lim = await checkLimit(caches.default, ip, searchWindows(env));
      if (!lim.ok) { noteRoute(env, "blocked"); return `Too many searches, wait ${lim.retryAfter} s`; }
      const q = await countToday(env, user.kid, "mcp");
      if (q.used >= limit) return `Daily limit of ${limit} searches reached for this key`;
      await q.bump();
      return null;
    },
    version: pkg.version,
    partner: partnerOn(env)
  });
  if (!res) return new Response(null, { status: 202 });
  return json(res, 200, {});
}

/* ---------- Admin: Nutzung der kostenlosen Kontingente ---------- */

async function admin(req: Request, env: Env, h: Record<string, string>): Promise<Response> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden" }, 401, h);
  let uid: string;
  try { uid = await verifyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7"); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }
  if (!isAdmin(env, uid)) return json({ error: "Kein Zugriff" }, 403, h);
  // nur prüfen, ob der Eintrag im Kontomenü erscheint
  if (new URL(req.url).searchParams.has("check")) return json({ admin: true }, 200, h);
  // Stellschrauben, ohne Schlüssel: nur ob sie gesetzt sind
  const config = {
    agentDaily: Number(env.AGENT_DAILY) || 5, bugDaily: Number(env.BUG_DAILY) || 5,
    model: env.GEMINI_MODEL || DEFAULT_MODEL, fallback: env.GEMINI_FALLBACK_MODEL || "", geminiPerDay: Number(env.GEMINI_RPD) || 0,
    gemini: !!env.GEMINI_API_KEY, travelpayouts: !!env.TRAVELPAYOUTS_TOKEN, ticketmaster: !!env.TICKETMASTER_KEY, viator: !!env.VIATOR_API_KEY,
    footballData: !!env.FOOTBALL_DATA_KEY, mcp: !!env.MCP_KEY_SECRET, partnerLinks: partnerOn(env), mcpTrips: !!tripStore(env), mcpDaily: Number(env.MCP_DAILY) || 50, bugs: !!(env.GITHUB_TOKEN && env.BUG_REPO), bugImages: !!env.BUG_BUCKET, kv: !!env.AGENT_KV
  };
  return json(await usageReport(env, config), 200, { ...h, "cache-control": "no-store" });
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
