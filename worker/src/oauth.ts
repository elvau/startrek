/*
 * Anmeldung per OAuth für den KI-Konnektor (MCP-Spezifikation: OAuth 2.1 mit PKCE, dynamische Anmeldung, #590).
 * Chat-Apps wie Claude.ai oder ChatGPT melden sich selbst an, der Nutzer stimmt in der App mit seiner Firebase-Anmeldung
 * zu. Kennungen der Chat-Apps, Anfragen, Codes und Schlüssel sind signiert (MCP_KEY_SECRET, apikey.ts) statt gespeichert;
 * gespeichert wird nur je Verbindung ein Eintrag in Firestore (mcpGrants: Konto, Name der Chat-App, Rücksprung-Adresse,
 * verbunden seit, zuletzt genutzt), damit man Verbindungen im Konto sieht und trennen kann.
 */
import { fromFs, fsClient, toFs, type StoreEnv } from "./firestore";
import { newKid, seal, unseal, type KeyInfo } from "./apikey";

export interface Grant {
  id: string; uid: string;
  /** Name der Chat-App (von ihr selbst angegeben) und Ziel des Rücksprungs (z. B. claude.ai) */
  client: string; host: string;
  /** verbunden seit (ISO), zuletzt genutzt (Tag) */
  at: string; used: string;
  /** gültiger Erneuerungsschlüssel (Kennung) bzw. noch nicht eingelöster Code; leer = keiner */
  rt: string; code: string;
  updateTime?: string;
}

export interface GrantStore {
  get(id: string): Promise<Grant | null>;
  create(g: Grant): Promise<void>;
  /** nur, wenn der Eintrag seit dem Lesen unverändert ist (sonst Fehler „conflict“) */
  update(g: Grant, change: Partial<Pick<Grant, "rt" | "code" | "used">>): Promise<void>;
  list(uid: string): Promise<Grant[]>;
  remove(id: string): Promise<void>;
  /** lange nicht genutzte und nie eingelöste Verbindungen löschen; gibt die Zahl zurück */
  sweep(now?: Date): Promise<number>;
}

export interface OAuthDeps {
  secret: string;
  grants: GrantStore | null;
  /** Firebase-Anmeldenachweis → Kontokennung (wirft, wenn ungültig) */
  verifyUser: (idToken: string) => Promise<string>;
  /** Adresse der App, dort stimmt man zu (?verbinden=…) */
  appUrl: string;
  /** CORS für Anfragen aus der App (leer: fremde Herkunft) */
  appCors: Record<string, string>;
  revoked?: (id: string) => boolean;
  now?: number;
}

export const SCOPE = "splitandfly";
const ACCESS_SEC = 3600, CODE_SEC = 300, REQUEST_SEC = 600;
/** so lange gilt eine Verbindung ohne Nutzung */
export const IDLE_DAYS = 90;

const ANY = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, mcp-protocol-version", "access-control-max-age": "86400" };
const PUBLIC = new Set(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server", "/oauth/register", "/oauth/token"]);
const APP = new Set(["/oauth/approve", "/oauth/grants", "/oauth/grants/remove"]);

export const isOAuthPath = (p: string) => PUBLIC.has(p) || APP.has(p) || p === "/oauth/authorize";

/** Hinweis für Programme ohne gültigen Schlüssel: wo die Anmeldung beschrieben ist */
export const wwwAuthenticate = (origin: string) => `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha = async (s: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
const out = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
const fail = (error: string, description: string, status = 400) => out({ error, error_description: description }, status, ANY);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n) : "");

/** Rücksprung-Adresse zulässig? https, http nur auf dem eigenen Rechner, sonst eigene Schemata von Programmen (cursor:, vscode:) */
export function okRedirect(u: unknown): boolean {
  if (typeof u !== "string" || u.length > 500) return false;
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && !["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:", "ws:", "wss:"].includes(url.protocol);
}

/** gleiche Rücksprung-Adresse; auf dem eigenen Rechner darf der Port abweichen (RFC 8252) */
function sameRedirect(registered: string, given: string): boolean {
  if (registered === given) return true;
  try {
    const a = new URL(registered), b = new URL(given);
    return a.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(a.hostname) && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
  } catch { return false; }
}

/** wohin es zurückgeht, für die Zustimmung (Host bzw. Schema eines Programms) */
function hostOf(u: string): string {
  const url = new URL(u);
  return url.protocol === "https:" || url.protocol === "http:" ? url.host : url.protocol.slice(0, -1);
}

function withParams(u: string, p: Record<string, string | undefined>): string {
  const url = new URL(u);
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  return url.toString();
}

function page(status: number, msg: string): Response {
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Split&amp;Fly</title><body style="font:16px system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1>Split&amp;Fly</h1><p>${msg}</p></body>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

interface Client { n: string; r: string[] }
interface AuthRequest { k: string; n: string; h: string; r: string; s: string; p: string; x: number }
interface Code { g: string; j: string; k: string; r: string; p: string; x: number }
interface Access { u: string; g: string; n: string; x: number }
interface Refresh { g: string; j: string; k: string; x: number }

async function readClient(secret: string, id: unknown): Promise<Client | null> {
  if (typeof id !== "string" || !id.startsWith("sfc_")) return null;
  const c = await unseal<Client>(secret, "client", id.slice(4), 4000);
  return c && typeof c.n === "string" && Array.isArray(c.r) ? c : null;
}

/** Formular (Standard) oder JSON */
async function params(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") || "";
  const text = (await req.text().catch(() => "")).slice(0, 8000);
  if (type.includes("json")) {
    try { return Object.fromEntries(Object.entries(JSON.parse(text)).map(([k, v]) => [k, String(v)])); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** Anfragen an /.well-known/… und /oauth/… */
export async function oauth(req: Request, deps: OAuthDeps): Promise<Response> {
  const url = new URL(req.url), path = url.pathname, origin = url.origin;
  const now = deps.now ?? Date.now();
  const pub = PUBLIC.has(path);
  if (req.method === "OPTIONS") return new Response(null, { status: pub || deps.appCors["access-control-allow-origin"] ? 204 : 403, headers: pub ? ANY : deps.appCors });

  if (path.startsWith("/.well-known/oauth-protected-resource") && req.method === "GET")
    return out({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: [SCOPE], resource_name: "Split&Fly" }, 200, ANY);
  if (path === "/.well-known/oauth-authorization-server" && req.method === "GET")
    return out({
      issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"], response_modes_supported: ["query"], grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"], code_challenge_methods_supported: ["S256"], scopes_supported: [SCOPE]
    }, 200, ANY);

  if (path === "/oauth/register" && req.method === "POST") {
    const b = await req.json().catch(() => null) as Record<string, unknown> | null;
    const uris = Array.isArray(b?.redirect_uris) ? b!.redirect_uris as unknown[] : [];
    if (!uris.length || uris.length > 5 || !uris.every(okRedirect)) return fail("invalid_redirect_uri", "redirect_uris: https, http://localhost or an app scheme, at most 5");
    const r = uris as string[];
    const n = clean(b!.client_name, 60) || hostOf(r[0]);
    const client_id = `sfc_${await seal(deps.secret, "client", { n, r })}`;
    // manche Chat-Apps wollen ein Geheimnis; es ist aus der Kennung abgeleitet, Schutz gibt PKCE
    const method = ["client_secret_post", "client_secret_basic"].includes(String(b!.token_endpoint_auth_method)) ? String(b!.token_endpoint_auth_method) : "none";
    return out({
      client_id, client_name: n, redirect_uris: r, client_id_issued_at: Math.floor(now / 1000),
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: method,
      ...(method === "none" ? {} : { client_secret: await sha(`${deps.secret}.secret.${client_id}`), client_secret_expires_at: 0 })
    }, 201, ANY);
  }

  if (path === "/oauth/authorize" && req.method === "GET") {
    const q = url.searchParams;
    const client = await readClient(deps.secret, q.get("client_id"));
    if (!client) return page(400, "Unbekannte Anwendung. Bitte in der Chat-App neu verbinden. (Unknown client_id.)");
    const given = q.get("redirect_uri");
    const redirect = given ? (client.r.some(r => sameRedirect(r, given)) ? given : null) : client.r.length === 1 ? client.r[0] : null;
    if (!redirect) return page(400, "Die Rücksprung-Adresse passt nicht zur Anwendung. (redirect_uri mismatch.)");
    const state = (q.get("state") || "").slice(0, 500);
    const back = (error: string, description: string) => Response.redirect(withParams(redirect, { error, error_description: description, state }), 302);
    if (q.get("response_type") !== "code") return back("unsupported_response_type", "Only code");
    const p = q.get("code_challenge") || "";
    if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(p)) return back("invalid_request", "PKCE with S256 required");
    if (!deps.grants) return back("temporarily_unavailable", "Trip storage not configured");
    const r = await seal(deps.secret, "req", { k: await sha(q.get("client_id")!), n: client.n, h: hostOf(redirect), r: redirect, s: state, p, x: now + REQUEST_SEC * 1000 } satisfies AuthRequest);
    return Response.redirect(withParams(deps.appUrl, { verbinden: r }), 302);
  }

  if (path === "/oauth/token" && req.method === "POST") return token(req, deps, now);

  if (APP.has(path)) {
    const h = deps.appCors;
    if (!h["access-control-allow-origin"]) return out({ error: "Herkunft nicht erlaubt" }, 403, h);
    if (!deps.grants) return out({ error: "Der KI-Konnektor ist noch nicht eingerichtet" }, 503, h);
    let uid: string;
    try { uid = await deps.verifyUser((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
    catch (e) { return out({ error: (e as Error).message || "Bitte anmelden" }, 401, h); }

    if (path === "/oauth/approve" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as { req?: unknown; allow?: unknown };
      const r = typeof b.req === "string" ? await unseal<AuthRequest>(deps.secret, "req", b.req) : null;
      if (!r || !(r.x > now)) return out({ error: "Die Anfrage ist abgelaufen. Bitte in der Chat-App noch einmal verbinden.", code: "oauth_expired" }, 400, h);
      if (b.allow !== true) return out({ redirect: withParams(r.r, { error: "access_denied", state: r.s }) }, 200, h);
      const g: Grant = { id: newKid() + newKid(), uid, client: r.n, host: r.h, at: new Date(now).toISOString(), used: day(now), rt: "", code: newKid() };
      await deps.grants.create(g);
      const code = `sfo_${await seal(deps.secret, "code", { g: g.id, j: g.code, k: r.k, r: r.r, p: r.p, x: now + CODE_SEC * 1000 } satisfies Code)}`;
      return out({ redirect: withParams(r.r, { code, state: r.s }) }, 200, h);
    }
    if (path === "/oauth/grants" && req.method === "GET") {
      const list = (await deps.grants.list(uid)).filter(g => g.rt).sort((a, b) => b.at.localeCompare(a.at));
      return out({ grants: list.map(g => ({ id: g.id, client: g.client, host: g.host, at: g.at.slice(0, 10), used: g.used })) }, 200, h);
    }
    if (path === "/oauth/grants/remove" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as { id?: unknown };
      const g = typeof b.id === "string" ? await deps.grants.get(b.id) : null;
      if (!g || g.uid !== uid) return out({ error: "Nicht gefunden" }, 404, h);
      await deps.grants.remove(g.id);
      return out({ removed: g.id }, 200, h);
    }
  }
  return out({ error: "Nicht gefunden" }, 404, pub ? ANY : deps.appCors);
}

async function token(req: Request, deps: OAuthDeps, now: number): Promise<Response> {
  const p = await params(req);
  // Kennung und Geheimnis auch per Basic-Anmeldung
  const basic = (req.headers.get("authorization") || "").match(/^Basic\s+(.+)$/i);
  if (basic) {
    try { const [id, secret] = atob(basic[1]).split(":").map(decodeURIComponent); p.client_id ||= id; p.client_secret ||= secret; } catch { return fail("invalid_client", "Bad Basic auth", 401); }
  }
  if (!(await readClient(deps.secret, p.client_id))) return fail("invalid_client", "Unknown client_id", 401);
  if (p.client_secret && p.client_secret !== await sha(`${deps.secret}.secret.${p.client_id}`)) return fail("invalid_client", "Wrong client_secret", 401);
  if (!deps.grants) return fail("temporarily_unavailable", "Trip storage not configured", 503);
  const k = await sha(p.client_id);

  let g: Grant | null, change: Partial<Grant>;
  if (p.grant_type === "authorization_code") {
    const c = p.code?.startsWith("sfo_") ? await unseal<Code>(deps.secret, "code", p.code.slice(4)) : null;
    if (!c || !(c.x > now) || c.k !== k) return fail("invalid_grant", "Code invalid or expired");
    if (p.redirect_uri && p.redirect_uri !== c.r) return fail("invalid_grant", "redirect_uri mismatch");
    if (!p.code_verifier || await sha(p.code_verifier) !== c.p) return fail("invalid_grant", "PKCE verification failed");
    g = await deps.grants.get(c.g);
    // nur einmal einlösbar
    if (!g || g.code !== c.j || g.rt) return fail("invalid_grant", "Code already used");
    change = { code: "" };
  } else if (p.grant_type === "refresh_token") {
    const r = p.refresh_token?.startsWith("sfr_") ? await unseal<Refresh>(deps.secret, "rt", p.refresh_token.slice(4)) : null;
    if (!r || !(r.x > now) || r.k !== k) return fail("invalid_grant", "Refresh token invalid or expired");
    g = await deps.grants.get(r.g);
    if (!g || g.rt !== r.j) return fail("invalid_grant", "Refresh token invalid or revoked");
    change = {};
  } else return fail("unsupported_grant_type", "authorization_code or refresh_token");

  if (deps.revoked?.(g.id)) return fail("invalid_grant", "Connection revoked");
  const j = newKid();
  try { await deps.grants.update(g, { ...change, rt: j, used: day(now) }); }
  catch (e) { if ((e as { conflict?: boolean }).conflict) return fail("invalid_grant", "Token already used"); throw e; }
  return out({
    access_token: `sfa_${await seal(deps.secret, "at", { u: g.uid, g: g.id, n: g.client, x: now + ACCESS_SEC * 1000 } satisfies Access)}`,
    token_type: "Bearer", expires_in: ACCESS_SEC, scope: SCOPE,
    refresh_token: `sfr_${await seal(deps.secret, "rt", { g: g.id, j, k, x: now + IDLE_DAYS * 86400_000 } satisfies Refresh)}`
  }, 200, ANY);
}

/** Zugangsschlüssel aus OAuth prüfen (signiert, nicht abgelaufen, Verbindung besteht); merkt sich „zuletzt genutzt“ einmal am Tag */
export async function verifyAccess(deps: Pick<OAuthDeps, "secret" | "grants" | "revoked" | "now">, tokenStr: string, later: (p: Promise<unknown>) => void = () => {}): Promise<KeyInfo | null> {
  if (!tokenStr.startsWith("sfa_") || !deps.grants) return null;
  const a = await unseal<Access>(deps.secret, "at", tokenStr.slice(4));
  const now = deps.now ?? Date.now();
  if (!a || !(a.x > now) || typeof a.u !== "string" || typeof a.g !== "string" || deps.revoked?.(a.g)) return null;
  const g = await deps.grants.get(a.g);
  if (!g || g.uid !== a.u || !g.rt) return null;
  if (g.used !== day(now)) later(deps.grants.update(g, { used: day(now) }).catch(() => {}));
  return { uid: g.uid, kid: g.id, name: g.client, at: g.at.slice(0, 10) };
}

/* ---------- Verbindungen in Firestore (mcpGrants, nur über das Dienstkonto; die App liest über den Such-Dienst) ---------- */

type FsDoc = { name: string; fields?: Record<string, Record<string, unknown>>; updateTime: string };
const KEYS = ["uid", "client", "host", "at", "used", "rt", "code"] as const;

function grantOf(doc: FsDoc): Grant {
  const f = doc.fields || {};
  const s = (k: string) => String(fromFs(f[k]) ?? "");
  return { id: doc.name.split("/").pop()!, uid: s("uid"), client: s("client"), host: s("host"), at: s("at"), used: s("used"), rt: s("rt"), code: s("code"), updateTime: doc.updateTime };
}

export function grantStore(env: StoreEnv, f: typeof fetch = fetch): GrantStore | null {
  const c = fsClient(env, f);
  if (!c) return null;
  const { root, base, call } = c;
  const docName = (id: string) => `${root}/mcpGrants/${id}`;
  const query = async (where: object, limit: number) => {
    const rows = await call(`${base}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "mcpGrants" }], where, limit } }) }) as unknown as { document?: FsDoc }[];
    return (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => grantOf(r.document!));
  };
  const field = (path: string, op: string, v: string) => ({ fieldFilter: { field: { fieldPath: path }, op, value: { stringValue: v } } });
  const remove = (ids: string[]) => ids.length ? call(`${base}:commit`, { method: "POST", body: JSON.stringify({ writes: ids.map(id => ({ delete: docName(id) })) }) }) : Promise.resolve({});
  return {
    async get(id) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
      try { return grantOf(await call(`${base}/mcpGrants/${id}`) as never); }
      catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
    },
    async create(g) {
      await call(`${base}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: [{ update: { name: docName(g.id), fields: Object.fromEntries(KEYS.map(k => [k, toFs(g[k])])) }, currentDocument: { exists: false } }] })
      });
    },
    async update(g, change) {
      const keys = Object.keys(change) as (keyof typeof change)[];
      try {
        await call(`${base}:commit`, {
          method: "POST",
          body: JSON.stringify({ writes: [{
            update: { name: docName(g.id), fields: Object.fromEntries(keys.map(k => [k, toFs(change[k])])) },
            updateMask: { fieldPaths: keys }, currentDocument: { updateTime: g.updateTime }
          }] })
        });
      } catch (e) {
        if ((e as { code?: string }).code === "FAILED_PRECONDITION") throw Object.assign(new Error("conflict"), { conflict: true });
        throw e;
      }
    },
    list: uid => query(field("uid", "EQUAL", uid), 50),
    async remove(id) { await remove([id]); },
    async sweep(now = new Date()) {
      const idle = day(now.getTime() - IDLE_DAYS * 86400_000), stale = new Date(now.getTime() - 86400_000).toISOString();
      const gone = [...await query(field("used", "LESS_THAN", idle), 200), ...(await query(field("rt", "EQUAL", ""), 200)).filter(g => g.at < stale)];
      const ids = [...new Set(gone.map(g => g.id))];
      await remove(ids);
      return ids.length;
    }
  };
}
