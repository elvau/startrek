/*
 * Such-Dienst der Reisekasse (Cloudflare Worker).
 * Fragt Flug- und Unterkunfts-Anbieter gleichzeitig ab und gibt eine zusammengeführte Liste zurück.
 * Schlüssel der Anbieter liegen als Cloudflare-Secrets, nie im Code oder in der App.
 */
import { parseQuery, searchAll, type FlightEnv } from "../../app/src/lib/flights/search";
import { parseStayQuery, searchStays, type StayEnv } from "../../app/src/lib/stays/search";
import type { FlightQuery } from "../../app/src/lib/flights/types";
import type { StayQuery } from "../../app/src/lib/stays/types";

interface Env extends FlightEnv, StayEnv {
  /** erlaubte Herkünfte, kommagetrennt */
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ORIGINS = "https://elvau.github.io,https://splitandfly.com,https://www.splitandfly.com,https://startrek-1b6a7.web.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173";

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(s => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "origin" };
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

    return json({ error: "Nicht gefunden" }, 404, h);
  }
};
