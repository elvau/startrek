/*
 * Such-Dienst der Reisekasse (Cloudflare Worker).
 * Fragt Flug- und Unterkunfts-Anbieter gleichzeitig ab und gibt eine zusammengeführte Liste zurück.
 * Schlüssel der Anbieter liegen als Cloudflare-Secrets, nie im Code oder in der App.
 */
import { parseQuery, searchAll, type FlightEnv } from "../../app/src/lib/flights/search";
import { healthBody } from "./health";
import { withCode } from "../../app/src/lib/errcodes";
import { parseStayQuery, searchStays, type StayEnv } from "../../app/src/lib/stays/search";
import type { FlightQuery } from "../../app/src/lib/flights/types";
import type { StayQuery } from "../../app/src/lib/stays/types";
import { runAgent } from "../../app/src/lib/agent/agent";
import { AUSBLICK_RAW, parseAusblick, type Ausblick } from "../../app/src/lib/info/ausblick";
import { requireVerified, verifyAnyIdToken, verifyIdToken } from "../../app/src/lib/agent/auth";
import { whereFrom } from "./where";
import { parseAgentRequest } from "../../app/src/lib/agent/types";
import { parseSetupRequest, setupFromGemini, setupPayload } from "../../app/src/lib/setup/ai";
import { importFromAi, importPayload, offerUsable, parseImportRequest } from "../../app/src/lib/import/ai";
import { cruiseKey, cruisePayload, cruisesFromAi, parseCruiseQuery, type CruiseHit } from "../../app/src/lib/cruises/search";
import { fetchPage } from "./page";
import { mcpOfferStore, offerStore } from "./offers";
import { parseEventQuery, searchEvents } from "../../app/src/lib/events/search";
import type { EventEnv } from "../../app/src/lib/events/types";
import { blockedResult, parseActivityQuery, searchActivities, viatorBlock } from "../../app/src/lib/activities/search";
import type { ActivityEnv } from "../../app/src/lib/activities/types";
import { parseCalendarQuery, searchCalendar, type CalendarResult } from "../../app/src/lib/flights/calendar";
import { fetchEcb, type Rates } from "../../app/src/lib/fx";
import { AA_LIST, parseAdvice, type AdviceMap } from "../../app/src/lib/advice";
import { HOLIDAY_SOURCE, type HolidayData } from "../../app/src/lib/holidays";
import { HOLIDAY_CC, fetchHolidays } from "./holidays";
import { CA_LIST, parseCanada, parseUkCountry, parseUkIndex, parseUsa, UK_LIST, ukCountry, US_LIST, type GovAdvice, type GovMap } from "../../app/src/lib/govadvice";
import { bugImage, reportBug, type BugEnv } from "./bugs";
import { agentBudget } from "./budget";
import { isOverloaded } from "./gemini";
import { kiCaller, kiModels, kiReady, type KiEnv } from "./ki";
import { isAdmin, meter, noteClick, noteRoute, usageReport, type UsageEnv } from "./usage";
import { checkLimit, IP_LIMITS, ipKey, searchWindows, type LimitEnv } from "./ratelimit";
import { isRevoked, issueKey, newKid, verifyKey, type KeyEnv } from "./apikey";
import { profilePrefsSaver, profileSaver, profileStore, tripStore, type StoreEnv } from "./firestore";
import { findHome } from "./home";
import { mcpMessage, type Saved } from "./mcp";
import { grantStore, isOAuthPath, oauth, verifyAccess, wwwAuthenticate, type OAuthDeps } from "./oauth";
import pkg from "../../app/package.json";
import { partnerOn } from "../../app/src/lib/partner";
import { parseRouteQuery, routeOrs, type RoadResult } from "../../app/src/lib/road/ors";

interface Env extends FlightEnv, StayEnv, EventEnv, ActivityEnv, BugEnv, UsageEnv, LimitEnv, KeyEnv, StoreEnv, KiEnv {
  /** KI-Konnektor: Suchen pro Schlüssel und Tag (Standard 50) */
  MCP_DAILY?: string;
  /** erlaubte Herkünfte, kommagetrennt */
  ALLOWED_ORIGINS?: string;
  /** optional: Tagesgrenze des Gemini-Modells laut AI Studio, nur für die Admin-Ansicht */
  GEMINI_RPD?: string;
  /** Anfragen pro Nutzer und Tag (Standard 5) */
  AGENT_DAILY?: string;
  /** Reise importieren (#457): Auslesen pro Nutzer und Tag (Standard 10) */
  IMPORT_DAILY?: string;
  /** Kreuzfahrten suchen (#519, KI mit Websuche): Suchen pro Nutzer und Tag (Standard 5) */
  CRUISE_DAILY?: string;
  FIREBASE_PROJECT_ID?: string;
  /** Firebase-Projekt der Testumgebung (elvau.github.io/startrek/); Konten daraus heißen „test:…“ */
  FIREBASE_TEST_PROJECT_ID?: string;
  /** Strecken mit dem Auto (OpenRouteService, Secret); fehlt er, schätzt die App selbst */
  ORS_KEY?: string;
  /** echte Anfragen an OpenRouteService pro Minute, für alle zusammen (Standard 4; ORS erlaubt 40) */
  ORS_PER_MIN?: string;
  /** Adresse der App für die Zustimmung bei OAuth (Standard https://splitandfly.com/; lokal für Tests) */
  APP_URL?: string;
  /** optional: KV-Speicher für das Tageslimit; ohne ihn zählt der Zwischenspeicher je Rechenzentrum */
  AGENT_KV?: KVNamespace;
}

const SEARCHES = new Set(["/flights/search", "/flights/calendar", "/stays/search", "/events/search", "/activities/search", "/road/route"]);

const DEFAULT_ORIGINS = "https://elvau.github.io,https://splitandfly.com,https://www.splitandfly.com,https://startrek-1b6a7.web.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173";

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(s => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "86400", vary: "origin" };
}

// Fehler bekommen einen festen Code (#466), die App übersetzt ihn
const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(withCode(body, status)), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export default {
  // täglich (Zeitplan in wrangler.toml): abgelaufene Einträge des Angebotsspeichers löschen (#462)
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const store = offerStore(env);
    if (store) ctx.waitUntil(store.sweep().then(n => console.log(JSON.stringify({ at: "offers.sweep", deleted: n }))).catch(e => console.log(JSON.stringify({ at: "offers.sweep", error: (e as Error).message }))));
    // Verbindungen des KI-Konnektors (OAuth): lange nicht genutzte und nie eingelöste löschen
    const grants = grantStore(env);
    if (grants) ctx.waitUntil(grants.sweep().then(n => console.log(JSON.stringify({ at: "grants.sweep", deleted: n }))).catch(e => console.log(JSON.stringify({ at: "grants.sweep", error: (e as Error).message }))));
  },
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // was unerwartet abbricht, kommt trotzdem mit CORS zurück (sonst sieht die App nur „Failed to fetch“)
    try { return await handle(req, env, ctx); }
    catch (e) {
      console.log(JSON.stringify({ at: "fetch", path: new URL(req.url).pathname, error: (e as Error).message }));
      return json({ error: "Interner Fehler im Such-Dienst, bitte noch einmal versuchen." }, 500, cors(req.headers.get("origin"), env));
    }
  }
};

/** Anfrage zu viel von dieser IP? Dann 429 mit Wartezeit, sonst null */
async function overLimit(kind: keyof typeof IP_LIMITS, req: Request, env: Env, h: Record<string, string>): Promise<Response | null> {
  const ip = ipKey(req.headers.get("cf-connecting-ip"));
  const lim = await checkLimit(caches.default, ip && `${kind}:${ip}`, IP_LIMITS[kind]);
  if (lim.ok) return null;
  noteRoute(env, "blocked");
  return json({ error: "Zu viele Anfragen in kurzer Zeit, bitte später noch einmal.", retryAfter: lim.retryAfter }, 429, { ...h, "retry-after": String(lim.retryAfter) });
}

async function handle(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    const h = cors(origin, env);
    // Anmeldung per OAuth für Chat-Apps (vor OPTIONS: die öffentlichen Adressen erlauben jede Herkunft)
    if (isOAuthPath(url.pathname)) {
      if (!env.MCP_KEY_SECRET) return json({ error: "Der KI-Konnektor ist noch nicht eingerichtet" }, 503, h);
      if (url.pathname === "/oauth/approve" && req.method === "POST") {
        const block = await overLimit("oauth", req, env, h);
        if (block) return block;
        noteRoute(env, "oauth");
      }
      return oauth(req, oauthDeps(env, h));
    }
    if (req.method === "OPTIONS") return new Response(null, { status: h["access-control-allow-origin"] ? 204 : 403, headers: h });

    if (url.pathname === "/" || url.pathname === "/health") {
      // partner: ob Partner-Links an sind (die App kennzeichnet sie dann und hängt die Kennung an eigene Links)
      return json(healthBody(env), 200, h);
    }

    // Suchen: höchstens so viele pro IP und Minute bzw. Stunde (schützt die Kontingente der Anbieter)
    if (req.method === "POST" && SEARCHES.has(url.pathname) && h["access-control-allow-origin"]) {
      const lim = await checkLimit(caches.default, ipKey(req.headers.get("cf-connecting-ip")), searchWindows(env));
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
      const fx = await rates(env, ctx);
      const result = route === "flights" ? await searchAll(q as FlightQuery, { ...env, FX: fx }, net) : await searchStays(q as StayQuery, { ...env, FX: fx }, net);
      if (result.offers.length) {
        ctx.waitUntil(cache.put(key, new Response(JSON.stringify(result), { headers: { "content-type": "application/json", "cache-control": "max-age=600" } })));
      }
      return json(result, 200, { ...h, "x-cache": "miss" });
    }

    // ungefährer Ort aus der Verbindung (für Abflughäfen ohne Wohnort); nichts gespeichert, nicht zwischenspeichern
    if (url.pathname === "/where" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      return json(whereFrom((req as Request & { cf?: unknown }).cf), 200, { ...h, "cache-control": "private, no-store" });
    }

    // Tageskurse für die App (Anzeige in anderen Währungen)
    if (url.pathname === "/rates" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      const r = await rates(env, ctx);
      return r ? json(r, 200, { ...h, "cache-control": "max-age=3600" }) : json({ error: "Kurse gerade nicht erreichbar" }, 503, h);
    }

    // Reise- und Sicherheitshinweise des Auswärtigen Amts (OpenData, alle Länder), 6 Stunden zwischengespeichert
    if (url.pathname === "/advice" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      try {
        const countries = await cachedJson<AdviceMap>("aa/travelwarning", 6 * 3600, async () => {
          const r = await fetch(AA_LIST, { headers: { accept: "application/json", "user-agent": "SplitAndFly/1.0 (+https://splitandfly.com)" } });
          if (!r.ok) throw new Error("AA " + r.status);
          return parseAdvice(await r.json());
        }, m => Object.keys(m).length > 100, ctx);
        return json({ countries, source: "Auswärtiges Amt (OpenData)" }, 200, { ...h, "cache-control": "max-age=3600" });
      } catch { return json({ error: "Hinweise gerade nicht erreichbar" }, 503, h); }
    }

    // „Neues & Ausblick“: Datei der Routine SAF 8 vom Branch „ausblick“, geprüft, eine Stunde zwischengespeichert
    if (url.pathname === "/ausblick" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      try {
        const data = await cachedJson<Ausblick | null>("gh/ausblick", 3600, async () => {
          const r = await fetch(AUSBLICK_RAW, { headers: { "user-agent": "SplitAndFly/1.0 (+https://splitandfly.com)" } });
          if (!r.ok) throw new Error("Ausblick " + r.status);
          return parseAusblick(await r.json());
        }, d => !!d, ctx);
        if (!data) throw new Error("Ausblick ungültig");
        return json(data, 200, { ...h, "cache-control": "max-age=900" });
      } catch { return json({ error: "Ausblick gerade nicht erreichbar" }, 503, h); }
    }

    // Schulferien und Feiertage je Land (#163, OpenHolidays), drei Tage zwischengespeichert; nur das Land kommt an
    if (url.pathname === "/holidays" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      const cc = (url.searchParams.get("cc") || "").toUpperCase();
      if (!HOLIDAY_CC.test(cc)) return json({ error: "Land fehlt" }, 400, h);
      const today = new Date().toISOString().slice(0, 10);
      try {
        const data = await cachedJson<HolidayData>(`oh/${cc}/${today.slice(0, 4)}`, 3 * 86400, () => fetchHolidays(cc, today), () => true, ctx);
        return json({ ...data, source: HOLIDAY_SOURCE }, 200, { ...h, "cache-control": "max-age=21600" });
      } catch { return json({ error: "Ferien gerade nicht erreichbar" }, 503, h); }
    }

    // Reisehinweise anderer Regierungen (#164): nur das Reiseland kommt an, die App wählt die Quelle je Staatsangehörigkeit
    if (url.pathname === "/advice/gov" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      const cc = (url.searchParams.get("cc") || "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(cc)) return json({ error: "Land fehlt" }, 400, h);
      const sources = await govAdvice(cc, ctx);
      return json({ cc, sources }, 200, { ...h, "cache-control": "max-age=3600" });
    }

    if (url.pathname === "/flights/calendar" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
      const q = parseCalendarQuery(body);
      if (typeof q === "string") return json({ error: q }, 400, h);
      noteRoute(env, "calendar");
      if (!env.TRAVELPAYOUTS_TOKEN) return json({ days: [], configured: false } satisfies CalendarResult, 200, h);
      // Richtpreise ändern sich langsam: 6 Stunden aus dem Zwischenspeicher
      try {
        const result = await cachedJson<CalendarResult>(`calendar/${encodeURIComponent(JSON.stringify(q))}`, 6 * 3600,
          async () => ({ days: await searchCalendar(q, env.TRAVELPAYOUTS_TOKEN!, meter(env)), configured: true }), r => r.days.length > 0, ctx);
        return json(result, 200, h);
      } catch (e) {
        return json({ days: [], configured: true, error: (e as Error).message } satisfies CalendarResult, 200, h);
      }
    }

    // Strecke mit dem Auto (Roadtrip, #201): Etappen mit km, Fahrzeit und Verlauf; 30 Tage zwischengespeichert
    if (url.pathname === "/road/route" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
      const pts = parseRouteQuery(body);
      if (typeof pts === "string") return json({ error: pts }, 400, h);
      noteRoute(env, "road");
      if (!env.ORS_KEY) return json({ legs: [], configured: false } satisfies RoadResult, 200, h);
      let wait = 0;
      try {
        const result = await cachedJson<RoadResult>(`road/${encodeURIComponent(JSON.stringify(pts))}`, 30 * 86400, async () => {
          // nur echte Anfragen zählen (Zwischenspeicher nicht): höchstens ORS_PER_MIN pro Minute, je Rechenzentrum
          const lim = await checkLimit(caches.default, "ors:all", [{ limit: Number(env.ORS_PER_MIN) || 4, sec: 60 }]);
          if (!lim.ok) { wait = lim.retryAfter; throw new Error("ORS: Grenze pro Minute erreicht"); }
          return { legs: await routeOrs(pts, env.ORS_KEY!, meter(env)), configured: true, source: "ors" };
        }, r => r.legs.length > 0, ctx);
        return json(result, 200, { ...h, "cache-control": "max-age=86400" });
      } catch (e) {
        return json({ legs: [], configured: true, error: (e as Error).message, ...(wait ? { retryAfter: wait } : {}) } satisfies RoadResult, 200, h);
      }
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
      const block = viatorBlock(origin, env);
      if (block) return json(blockedResult(block), 200, h);
      // Touren ändern sich selten: 6 Stunden aus dem Zwischenspeicher
      const result = await cachedJson(`activities${partnerOn(env) ? "/p" : ""}/${encodeURIComponent(JSON.stringify(q))}`, 6 * 3600, () => searchActivities(q, env, meter(env)), r => r.activities.length > 0, ctx);
      return json(result, 200, h);
    }

    if (url.pathname === "/agent" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      noteRoute(env, "agent");
      return (await overLimit("agent", req, env, h)) || agent(req, env, h);
    }

    if (url.pathname === "/setup" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      noteRoute(env, "setup");
      return (await overLimit("agent", req, env, h)) || setup(req, env, h);
    }

    if (url.pathname === "/import" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      noteRoute(env, "import");
      // Dateien höchstens etwa 8 MB (Base64): größere Anfragen gar nicht erst einlesen
      if (Number(req.headers.get("content-length") || 0) > 12_000_000) return json({ error: "Anfrage zu groß" }, 413, h);
      return (await overLimit("agent", req, env, h)) || importTrip(req, env, h);
    }

    if (url.pathname === "/cruises/search" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      noteRoute(env, "cruises");
      return (await overLimit("agent", req, env, h)) || cruiseSearch(req, env, h, ctx);
    }

    if (url.pathname === "/bug" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      noteRoute(env, "bug");
      // Bild höchstens 3 MB: größere Anfragen gar nicht erst einlesen
      if (Number(req.headers.get("content-length") || 0) > 4_000_000) return json({ error: "Anfrage zu groß" }, 413, h);
      const block = await overLimit("bug", req, env, h);
      if (block) return block;
      return reportBug(req, env, h, json, (uid, kind) => countToday(env, uid, kind), meter(env));
    }

    // Klick auf einen Anbieter-Link (sendBeacon aus der App), nur zählen
    if (url.pathname === "/click" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      if (await overLimit("click", req, env, h)) return new Response(null, { status: 429, headers: h });
      const body = await req.text().then(s => JSON.parse(s.slice(0, 200))).catch(() => null);
      return new Response(null, { status: noteClick(env, body) ? 204 : 400, headers: h });
    }

    if (url.pathname === "/admin/usage" && req.method === "GET") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      return admin(req, env, h);
    }
    if (url.pathname.startsWith("/bug-image/") && req.method === "GET") return bugImage(url.pathname, env);

    if (url.pathname === "/mcp/key" && req.method === "POST") {
      if (!h["access-control-allow-origin"]) return json({ error: "Herkunft nicht erlaubt" }, 403, h);
      return (await overLimit("mcpkey", req, env, h)) || mcpKey(req, env, h);
    }
    if (url.pathname === "/mcp") return mcp(req, env, ctx);

    return json({ error: "Nicht gefunden" }, 404, h);
  }
}

/* ---------- KI-Reiseplaner (Claude, sonst Gemini) ---------- */

/** so lange darf der KI-Planer rechnen, dann schlägt er das bisher Gefundene vor */
const AGENT_DEADLINE_MS = 80_000;

/** Tageszähler je Nutzer: im KV-Speicher, sonst im Zwischenspeicher des Rechenzentrums; refund setzt bump zurück */
async function countToday(env: Env, uid: string, kind = "agent"): Promise<{ used: number; bump: () => Promise<void>; refund: () => Promise<void> }> {
  const day = new Date().toISOString().slice(0, 10);
  if (env.AGENT_KV) {
    const k = `${kind}:${uid}:${day}`;
    const used = Number(await env.AGENT_KV.get(k)) || 0;
    const put = (n: number) => env.AGENT_KV!.put(k, String(n), { expirationTtl: 2 * 86400 });
    return { used, bump: () => put(used + 1), refund: () => put(used) };
  }
  const k = new Request(`https://quota.splitandfly/${kind === "agent" ? "" : kind + "/"}${encodeURIComponent(uid)}/${day}`);
  const hit = await caches.default.match(k);
  const used = hit ? Number(await hit.text()) || 0 : 0;
  const put = (n: number) => caches.default.put(k, new Response(String(n), { headers: { "cache-control": "max-age=172800" } }));
  return { used, bump: () => put(used + 1), refund: () => put(used) };
}

async function agent(req: Request, env: Env, h: Record<string, string>): Promise<Response> {
  if (!kiReady(env)) return json({ error: "Der KI-Planer ist noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden, um den KI-Planer zu nutzen" }, 401, h);
  let uid: string;
  try { uid = await verifyAnyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7", env.FIREBASE_TEST_PROJECT_ID); requireVerified(token); }
  catch (e) { console.log(JSON.stringify({ at: "agent", status: 401, error: (e as Error).message })); return json({ error: (e as Error).message }, 401, h); }

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
  const r = parseAgentRequest(body);
  if (typeof r === "string") return json({ error: r }, 400, h);

  const limit = Number(env.AGENT_DAILY) || 5;
  const quota = await countToday(env, uid);
  if (quota.used >= limit) return json({ error: `Tageslimit erreicht (${limit} Anfragen). Morgen geht es weiter.`, remaining: 0 }, 429, h);

  const model = kiModels(env).join(" → ");
  // Cloudflare (kostenloser Tarif): höchstens 50 ausgehende Anfragen pro Aufruf. Eine Flugsuche braucht bis zu 9
  // (Kiwi 3, Travelpayouts je Flughafenpaar 1), eine Unterkunftssuche 3; für die KI bleiben immer RESERVE frei.
  const net = meter(env);
  const budget = agentBudget(48, 8, 9, net);
  // überlastet: kurz warten und wiederholen, dann der andere Anbieter bzw. das Ausweichmodell
  const gemini = kiCaller(env, { f: net, onCall: () => { budget.used++; } });
  // gleich zählen, nicht erst nach dem Lauf: sonst kämen viele gleichzeitige Anfragen alle durch
  await quota.bump();
  try {
    const fx = await rates(env);
    const result = await runAgent(r, { deadline: Date.now() + AGENT_DEADLINE_MS, gemini, flights: q => searchAll(q, { ...env, FX: fx }, budget.fetch).then(real), stays: q => searchStays(q, { ...env, FX: fx }, budget.fetch).then(real), events: q => cachedJson(`events/${encodeURIComponent(JSON.stringify(q))}`, 3600, () => searchEvents(q, env, budget.fetch, cachedJson), r => r.events.length > 0), canSearch: budget.canSearch });
    // eine Rückfrage zählt nicht gegen das Tageslimit, erst die Suche danach
    if (result.question) { await quota.refund(); return json({ ...result, remaining: Math.max(0, limit - quota.used) }, 200, h); }
    return json({ ...result, remaining: Math.max(0, limit - quota.used - 1) }, 200, h);
  } catch (e) {
    // in den Workers-Logs sichtbar (Observability), die App zeigt nur eine übersetzte Meldung
    console.log(JSON.stringify({ at: "agent", model, error: (e as Error).message }));
    // Fehler auf unserer Seite oder bei der KI zählen nicht gegen das Tageslimit
    await quota.refund().catch(() => {});
    const msg = (e as Error).message;
    // Anbieter überlastet (nach Wiederholung und Ausweichmodell): 503 statt 502, die App zeigt eine eigene Meldung
    if (isOverloaded(msg)) return json({ error: msg, overloaded: true, remaining: Math.max(0, limit - quota.used) }, 503, h);
    return json({ error: msg, remaining: Math.max(0, limit - quota.used) }, 502, h);
  }
}

/** Konto einrichten (#160): freier Text → Felder; zählt als eine Anfrage im Tageskontingent des KI-Planers */
async function setup(req: Request, env: Env, h: Record<string, string>): Promise<Response> {
  if (!kiReady(env)) return json({ error: "Der KI-Planer ist noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden, um den KI-Planer zu nutzen" }, 401, h);
  let uid: string;
  try { uid = await verifyAnyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7", env.FIREBASE_TEST_PROJECT_ID); requireVerified(token); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }
  const r = parseSetupRequest(await req.json().catch(() => null));
  if (typeof r === "string") return json({ error: r }, 400, h);
  const limit = Number(env.AGENT_DAILY) || 5;
  const quota = await countToday(env, uid);
  if (quota.used >= limit) return json({ error: `Tageslimit erreicht (${limit} Anfragen). Morgen geht es weiter.`, remaining: 0 }, 429, h);
  await quota.bump();
  const model = kiModels(env).join(" → ");
  try {
    const res = await kiCaller(env, { f: meter(env) })(setupPayload(r.text));
    return json({ fields: setupFromGemini(res), remaining: Math.max(0, limit - quota.used - 1) }, 200, h);
  } catch (e) {
    console.log(JSON.stringify({ at: "setup", model, error: (e as Error).message }));
    await quota.refund().catch(() => {});
    const msg = (e as Error).message;
    if (isOverloaded(msg)) return json({ error: msg, overloaded: true, remaining: Math.max(0, limit - quota.used) }, 503, h);
    return json({ error: msg, remaining: Math.max(0, limit - quota.used) }, 502, h);
  }
}

/*
 * Reise importieren (#457): Dateien, Text oder Link → Angebotsdaten. Dateien werden nur an die KI weitergereicht und
 * nirgends gespeichert. Ein Link, der sich nicht lesen lässt, kostet keine Anfrage: sofort needScreenshot.
 */
async function importTrip(req: Request, env: Env, h: Record<string, string>): Promise<Response> {
  if (!kiReady(env)) return json({ error: "Der KI-Planer ist noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden, um den Import zu nutzen" }, 401, h);
  let uid: string;
  try { uid = await verifyAnyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7", env.FIREBASE_TEST_PROJECT_ID); requireVerified(token); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }
  const r = parseImportRequest(await req.json().catch(() => null));
  if (typeof r === "string") return json({ error: r }, 400, h);
  const limit = Number(env.IMPORT_DAILY) || 10;
  const quota = await countToday(env, uid, "import");
  // Angebotsspeicher (#462): gleiche Eingabe schon ausgelesen und noch gültig → ohne KI, zählt nicht
  const store = offerStore(env, meter(env));
  const hit = store ? await store.find(r).catch(e => { console.log(JSON.stringify({ at: "offers.find", error: (e as Error).message })); return null; }) : null;
  if (hit) return json({ offer: hit.offer, cached: true, until: hit.until, remaining: Math.max(0, limit - quota.used) }, 200, h);
  if (quota.used >= limit) return json({ error: `Tageslimit erreicht (${limit} Importe). Morgen geht es weiter.`, remaining: 0 }, 429, h);
  const page = r.url ? await fetchPage(r.url, meter(env)) : null;
  if (r.url && !page && !r.text && !r.files.length) return json({ error: "Seite lässt sich nicht lesen", needScreenshot: true, remaining: limit - quota.used }, 422, h);
  await quota.bump();
  const model = kiModels(env).join(" → ");
  try {
    const offer = importFromAi(await kiCaller(env, { f: meter(env) })(importPayload(r, page || undefined)));
    const remaining = Math.max(0, limit - quota.used - 1);
    if (!offerUsable(offer)) return json({ error: "Kein Angebot erkannt", unreadable: true, needScreenshot: !!r.url && !r.files.length, remaining }, 422, h);
    if (store) await store.save(r, offer).catch(e => console.log(JSON.stringify({ at: "offers.save", error: (e as Error).message })));
    return json({ offer, remaining }, 200, h);
  } catch (e) {
    console.log(JSON.stringify({ at: "import", model, files: r.files.length, error: (e as Error).message }));
    await quota.refund().catch(() => {});
    const msg = (e as Error).message;
    if (isOverloaded(msg)) return json({ error: msg, overloaded: true, remaining: Math.max(0, limit - quota.used) }, 503, h);
    return json({ error: msg, remaining: Math.max(0, limit - quota.used) }, 502, h);
  }
}

/*
 * Kreuzfahrten suchen (#519): KI mit Websuche, solange kein Partner einen Feed hat. Gleiche Suche 12 Stunden aus dem
 * Zwischenspeicher (zählt nicht); sonst eine Suche im eigenen Tageskontingent. Ohne Treffer kein Eintrag im Speicher.
 */
async function cruiseSearch(req: Request, env: Env, h: Record<string, string>, ctx: ExecutionContext): Promise<Response> {
  if (!kiReady(env)) return json({ error: "Der KI-Planer ist noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden, um Kreuzfahrten zu suchen" }, 401, h);
  let uid: string;
  try { uid = await verifyAnyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7", env.FIREBASE_TEST_PROJECT_ID); requireVerified(token); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }
  const q = parseCruiseQuery(await req.json().catch(() => null));
  if (typeof q === "string") return json({ error: q }, 400, h);
  const limit = Number(env.CRUISE_DAILY) || 5;
  const quota = await countToday(env, uid, "cruise");
  const k = new Request(`https://cache.splitandfly/cruises/${encodeURIComponent(cruiseKey(q))}`);
  const hit = await caches.default.match(k);
  if (hit) return json({ cruises: (await hit.json()) as CruiseHit[], cached: true, remaining: Math.max(0, limit - quota.used) }, 200, h);
  if (quota.used >= limit) return json({ error: `Tageslimit erreicht (${limit} Suchen). Morgen geht es weiter.`, remaining: 0 }, 429, h);
  await quota.bump();
  const model = kiModels(env).join(" → ");
  try {
    // Websuche dauert: länger warten; pausiert Claude die Runde (pause_turn), höchstens zweimal fortsetzen
    const call = kiCaller(env, { f: meter(env), timeoutMs: 90000 });
    const payload = cruisePayload(q);
    let res = await call(payload) as { candidates?: { content?: object; finishReason?: string }[] };
    for (let i = 0; i < 2 && res?.candidates?.[0]?.finishReason === "pause_turn"; i++) {
      payload.contents.push(res.candidates[0].content as (typeof payload.contents)[number]);
      res = await call(payload) as typeof res;
    }
    const cruises = cruisesFromAi(res, q);
    const remaining = Math.max(0, limit - quota.used - 1);
    if (cruises.length) ctx.waitUntil(caches.default.put(k, new Response(JSON.stringify(cruises), { headers: { "content-type": "application/json", "cache-control": "max-age=43200" } })));
    return json({ cruises, remaining }, 200, h);
  } catch (e) {
    console.log(JSON.stringify({ at: "cruises", model, error: (e as Error).message }));
    await quota.refund().catch(() => {});
    const msg = (e as Error).message;
    if (isOverloaded(msg)) return json({ error: msg, overloaded: true, remaining: Math.max(0, limit - quota.used) }, 503, h);
    return json({ error: msg, remaining: Math.max(0, limit - quota.used) }, 502, h);
  }
}

/* ---------- KI-Konnektor (MCP) ---------- */

/** persönlichen Schlüssel ausstellen (angemeldet, höchstens 3 pro Tag); der Such-Dienst speichert ihn nicht */
async function mcpKey(req: Request, env: Env, h: Record<string, string>): Promise<Response> {
  if (!env.MCP_KEY_SECRET) return json({ error: "Der KI-Konnektor ist noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden" }, 401, h);
  // nur echte Konten: der Konnektor schreibt in die Reisen des Hauptprojekts (Testprojekt hier nicht)
  let uid: string;
  try { uid = await verifyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7"); requireVerified(token); }
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

function oauthDeps(env: Env, h: Record<string, string>): OAuthDeps {
  return {
    secret: env.MCP_KEY_SECRET!, grants: grantStore(env), appUrl: env.APP_URL || "https://splitandfly.com/", appCors: h, revoked: id => isRevoked(env, id),
    // nur echte Konten mit bestätigter Adresse, wie beim Schlüssel
    verifyUser: async token => { if (!token) throw new Error("Bitte anmelden"); const uid = await verifyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7"); requireVerified(token); return uid; }
  };
}

/** MCP über HTTP: eine JSON-RPC-Nachricht pro Anfrage, Antwort als JSON (kein Stream) */
async function mcp(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const plain = (status: number, msg: string, extra: Record<string, string> = {}) => json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: msg } }, status, extra);
  if (req.method !== "POST") return plain(405, "Nur POST", { allow: "POST" });
  // aus dem Browser nur von unseren Seiten (Schutz vor DNS-Rebinding); KI-Programme schicken keinen Origin mit
  const origin = req.headers.get("origin");
  if (origin && !cors(origin, env)["access-control-allow-origin"]) return plain(403, "Herkunft nicht erlaubt");
  if (!env.MCP_KEY_SECRET) return plain(503, "Der KI-Konnektor ist noch nicht eingerichtet");
  // persönlicher Schlüssel (sf_…) oder Zugangsschlüssel aus OAuth (sfa_…)
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = await verifyKey(env, bearer) || await verifyAccess(oauthDeps(env, {}), bearer, p => ctx.waitUntil(p));
  if (!user) return plain(401, "Schlüssel fehlt oder ist ungültig", { "www-authenticate": wwwAuthenticate(new URL(req.url).origin) });
  let msg: unknown;
  try { msg = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, {}); }
  if (Array.isArray(msg)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch nicht unterstützt" } }, 400, {});
  noteRoute(env, "mcp");

  const net = meter(env);
  const ip = req.headers.get("cf-connecting-ip");
  const kept = mcpOfferStore<Saved>(env, net);
  const offerKey = (id: string) => new Request(`https://mcp.splitandfly/offer/${user.kid}/${encodeURIComponent(id)}`);
  const limit = Number(env.MCP_DAILY) || 50;
  const res = await mcpMessage(msg, user, {
    flights: async q => real(await searchAll(q, { ...env, FX: await rates(env) }, net)),
    stays: async q => real(await searchStays(q, { ...env, FX: await rates(env) }, net)),
    events: q => cachedJson(`events/${encodeURIComponent(JSON.stringify(q))}`, 3600, () => searchEvents(q, env, net, cachedJson), r => r.events.length > 0, ctx),
    store: tripStore(env, net),
    profile: profileStore(env, net) || undefined,
    savePrefs: profilePrefsSaver(env, net) || undefined,
    saveProfile: profileSaver(env, net) || undefined,
    home: (text, cc) => findHome(text, cc, (env.APP_URL || "https://splitandfly.com/").replace(/\/?$/, "/"), net),
    // Firestore, damit Suche und Übernahme in verschiedenen Rechenzentren laufen können; ohne Dienstkonto nur lokal
    offers: kept ? { put: list => kept.put(user.kid, list), get: id => kept.get(user.kid, id) } : {
      put: async list => { await Promise.all(list.map(([id, v]) => caches.default.put(offerKey(id), new Response(JSON.stringify(v), { headers: { "cache-control": "max-age=21600" } })))); },
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
  try { uid = await verifyAnyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7", env.FIREBASE_TEST_PROJECT_ID); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }
  if (!isAdmin(env, uid)) return json({ error: "Kein Zugriff" }, 403, h);
  // nur prüfen, ob der Eintrag im Kontomenü erscheint
  if (new URL(req.url).searchParams.has("check")) return json({ admin: true }, 200, h);
  // Stellschrauben, ohne Schlüssel: nur ob sie gesetzt sind
  const config = {
    agentDaily: Number(env.AGENT_DAILY) || 5, bugDaily: Number(env.BUG_DAILY) || 5,
    model: kiModels(env)[0] || "", fallback: kiModels(env).slice(1).join(" → "), geminiPerDay: Number(env.GEMINI_RPD) || 0,
    gemini: !!env.GEMINI_API_KEY, claude: !!env.ANTHROPIC_API_KEY, travelpayouts: !!env.TRAVELPAYOUTS_TOKEN, ticketmaster: !!env.TICKETMASTER_KEY, viator: !!env.VIATOR_API_KEY,
    footballData: !!env.FOOTBALL_DATA_KEY, mcp: !!env.MCP_KEY_SECRET, partnerLinks: partnerOn(env), mcpTrips: !!tripStore(env), mcpDaily: Number(env.MCP_DAILY) || 50, bugs: !!(env.GITHUB_TOKEN && env.BUG_REPO), bugImages: !!env.BUG_BUCKET, kv: !!env.AGENT_KV
  };
  return json(await usageReport(env, config), 200, { ...h, "cache-control": "no-store" });
}

/** JSON im Zwischenspeicher des Rechenzentrums (z. B. Mannschaftslisten für eine Woche) */
/** KI und Konnektor bekommen keine Testpreise (Sandbox-Zugänge), nur die App zeigt sie mit Hinweis */
const real = <R extends { offers: { test?: boolean }[] }>(r: R): R => ({ ...r, offers: r.offers.filter(o => !o.test) });

/** Tageskurse der EZB, 12 Stunden zwischengespeichert; ohne Kurse bleibt es bei Preisen in der Suchwährung */
async function rates(env: Env, ctx?: ExecutionContext): Promise<Rates | null> {
  try { return await cachedJson("fx/ecb", 12 * 3600, () => fetchEcb(meter(env)), r => Object.keys(r.rates).length > 10, ctx); }
  catch { return null; }
}

const GOV_HEADERS = { accept: "application/json", "user-agent": "SplitAndFly/1.0 (+https://splitandfly.com)" };
async function getJson(u: string): Promise<unknown> {
  const r = await fetch(u, { headers: GOV_HEADERS });
  if (!r.ok) throw new Error(`${new URL(u).host} ${r.status}`);
  return r.json();
}
/** Reisehinweise von FCDO, State Department und Kanada für ein Land; Listen 6 Stunden (UK-Liste 1 Tag) zwischengespeichert, fehlende Quellen fallen weg */
async function govAdvice(cc: string, ctx: ExecutionContext): Promise<GovMap> {
  const many = (m: Record<string, unknown>) => Object.keys(m).length > 100;
  const [ca, us, uk] = await Promise.allSettled([
    cachedJson("gov/ca", 6 * 3600, async () => parseCanada(await getJson(CA_LIST)), many, ctx).then(m => m[cc]),
    cachedJson("gov/us", 6 * 3600, async () => parseUsa(await getJson(US_LIST)), many, ctx).then(m => m[cc]),
    cachedJson("gov/uk", 24 * 3600, async () => parseUkIndex(await getJson(UK_LIST)), many, ctx).then(async m => {
      const slug = m[cc];
      return slug ? cachedJson<GovAdvice>(`gov/uk/${slug}`, 6 * 3600, async () => parseUkCountry(await getJson(ukCountry(slug)), slug), () => true, ctx) : undefined;
    })
  ]);
  const ok = (r: PromiseSettledResult<GovAdvice | undefined>) => (r.status === "fulfilled" ? r.value : undefined);
  const out: GovMap = {};
  if (ok(uk)) out.GB = ok(uk);
  if (ok(us)) out.US = ok(us);
  if (ok(ca)) out.CA = ok(ca);
  return out;
}

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
