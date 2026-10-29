/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { okRedirect, oauth, verifyAccess, wwwAuthenticate, type Grant, type GrantStore, type OAuthDeps } from "./oauth";

const W = "https://worker.test";
const APP = { "access-control-allow-origin": "https://splitandfly.com" };

/** Verbindungen im Speicher statt Firestore, mit Versionsprüfung wie dort */
function memGrants(): GrantStore & { docs: Map<string, Grant> } {
  const docs = new Map<string, Grant>();
  let v = 0;
  return {
    docs,
    get: async id => (docs.has(id) ? { ...docs.get(id)! } : null),
    create: async g => { if (docs.has(g.id)) throw new Error("exists"); docs.set(g.id, { ...g, updateTime: String(++v) }); },
    update: async (g, change) => {
      const cur = docs.get(g.id);
      if (!cur || cur.updateTime !== g.updateTime) throw Object.assign(new Error("conflict"), { conflict: true });
      docs.set(g.id, { ...cur, ...change, updateTime: String(++v) });
    },
    list: async uid => [...docs.values()].filter(g => g.uid === uid),
    remove: async id => { docs.delete(id); },
    sweep: async () => 0
  };
}

function setup(extra: Partial<OAuthDeps> = {}) {
  const grants = memGrants();
  const deps: OAuthDeps = {
    secret: "geheim", grants, appUrl: "https://splitandfly.com/", appCors: APP,
    verifyUser: async t => { if (t === "tok-dani") return "u1"; if (t === "tok-eve") return "u2"; throw new Error("Bitte anmelden"); },
    ...extra
  };
  const call = (path: string, init: RequestInit = {}, d: Partial<OAuthDeps> = {}) => oauth(new Request(W + path, init), { ...deps, ...d });
  const post = (path: string, body: unknown, auth?: string) =>
    call(path, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
  const form = (body: Record<string, string>) =>
    call("/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  return { grants, deps, call, post, form };
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk-test-verifier";
const challenge = async (v = VERIFIER) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))));
const CB = "https://claude.ai/api/mcp/auth_callback";

/** Anmeldung der Chat-App, Weiterleitung zur App, Zustimmung: gibt Code und Kennung zurück */
async function connect(s: ReturnType<typeof setup>, uid = "tok-dani") {
  const reg = await (await s.post("/oauth/register", { client_name: "Claude", redirect_uris: [CB] })).json() as { client_id: string };
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: CB, code_challenge: await challenge(), code_challenge_method: "S256", state: "st1", scope: "splitandfly" });
  const auth = await s.call(`/oauth/authorize?${q}`);
  const req = new URL(auth.headers.get("location")!).searchParams.get("verbinden")!;
  const ok = await (await s.post("/oauth/approve", { req, allow: true }, uid)).json() as { redirect: string };
  const back = new URL(ok.redirect);
  return { clientId: reg.client_id, code: back.searchParams.get("code")!, state: back.searchParams.get("state"), req };
}

describe("OAuth für den KI-Konnektor", () => {
  it("beschreibt sich unter /.well-known, für jede Herkunft", async () => {
    const s = setup();
    const pr = await s.call("/.well-known/oauth-protected-resource");
    expect(await pr.json()).toMatchObject({ resource: `${W}/mcp`, authorization_servers: [W] });
    expect(pr.headers.get("access-control-allow-origin")).toBe("*");
    const as = await (await s.call("/.well-known/oauth-authorization-server")).json() as Record<string, unknown>;
    expect(as).toMatchObject({ issuer: W, authorization_endpoint: `${W}/oauth/authorize`, token_endpoint: `${W}/oauth/token`, registration_endpoint: `${W}/oauth/register`, code_challenge_methods_supported: ["S256"] });
    expect(wwwAuthenticate(W)).toBe(`Bearer resource_metadata="${W}/.well-known/oauth-protected-resource"`);
    expect((await s.call("/oauth/token", { method: "OPTIONS" })).status).toBe(204);
  });

  it("prüft Rücksprung-Adressen bei der Anmeldung", async () => {
    expect(okRedirect(CB)).toBe(true);
    expect(okRedirect("http://127.0.0.1:33418/callback")).toBe(true);
    expect(okRedirect("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
    expect(okRedirect("http://evil.example/cb")).toBe(false);
    expect(okRedirect("javascript:alert(1)")).toBe(false);
    expect(okRedirect("https://claude.ai/cb#x")).toBe(false);
    const s = setup();
    expect((await s.post("/oauth/register", { redirect_uris: ["http://evil.example/cb"] })).status).toBe(400);
    expect((await s.post("/oauth/register", {})).status).toBe(400);
    const reg = await (await s.post("/oauth/register", { client_name: "<b>Claude</b>", redirect_uris: [CB] })).json() as Record<string, unknown>;
    expect(reg.client_id).toMatch(/^sfc_/);
    expect(reg.client_name).toBe("bClaude/b");
    expect(reg.token_endpoint_auth_method).toBe("none");
    expect(reg.client_secret).toBeUndefined();
  });

  it("ganzer Ablauf: Zustimmung, Code mit PKCE, Zugang, Erneuerung, Trennen", async () => {
    const s = setup();
    const c = await connect(s);
    expect(c.code).toMatch(/^sfo_/);
    expect(c.state).toBe("st1");
    // Anfrage an die App zeigt Name und Ziel, ohne Geheimnisse
    const shown = JSON.parse(atob(c.req.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    expect(shown).toMatchObject({ n: "Claude", h: "claude.ai" });

    const tok = await (await s.form({ grant_type: "authorization_code", code: c.code, client_id: c.clientId, redirect_uri: CB, code_verifier: VERIFIER })).json() as Record<string, string>;
    expect(tok).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(tok.access_token).toMatch(/^sfa_/);
    const user = await verifyAccess(s.deps, tok.access_token);
    expect(user).toMatchObject({ uid: "u1", name: "Claude" });

    // Code nur einmal
    const again = await s.form({ grant_type: "authorization_code", code: c.code, client_id: c.clientId, redirect_uri: CB, code_verifier: VERIFIER });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: "invalid_grant" });

    // Erneuern wechselt den Erneuerungsschlüssel, der alte gilt nicht mehr
    const ref = await (await s.form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: c.clientId })).json() as Record<string, string>;
    expect(ref.access_token).toMatch(/^sfa_/);
    expect((await s.form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: c.clientId })).status).toBe(400);

    // Liste im Konto, nur eigene; fremdes Konto kann nicht trennen
    const list = await (await s.call("/oauth/grants", { headers: { authorization: "Bearer tok-dani" } })).json() as { grants: { id: string; client: string; host: string }[] };
    expect(list.grants).toHaveLength(1);
    expect(list.grants[0]).toMatchObject({ client: "Claude", host: "claude.ai" });
    expect(await (await s.call("/oauth/grants", { headers: { authorization: "Bearer tok-eve" } })).json()).toEqual({ grants: [] });
    expect((await s.post("/oauth/grants/remove", { id: list.grants[0].id }, "tok-eve")).status).toBe(404);

    // Trennen: Zugang und Erneuerung gelten sofort nicht mehr
    expect((await s.post("/oauth/grants/remove", { id: list.grants[0].id }, "tok-dani")).status).toBe(200);
    expect(await verifyAccess(s.deps, ref.access_token)).toBeNull();
    expect((await s.form({ grant_type: "refresh_token", refresh_token: ref.refresh_token, client_id: c.clientId })).status).toBe(400);
  });

  it("lehnt falschen Code-Prüfwert, fremde Chat-App und abgelaufene Schlüssel ab", async () => {
    const s = setup();
    const c = await connect(s);
    const bad = await s.form({ grant_type: "authorization_code", code: c.code, client_id: c.clientId, code_verifier: "falsch-falsch-falsch-falsch-falsch-falsch-falsch" });
    expect(await bad.json()).toMatchObject({ error: "invalid_grant" });
    const other = await (await s.post("/oauth/register", { client_name: "Andere", redirect_uris: [CB] })).json() as { client_id: string };
    expect(await (await s.form({ grant_type: "authorization_code", code: c.code, client_id: other.client_id, code_verifier: VERIFIER })).json()).toMatchObject({ error: "invalid_grant" });
    expect((await s.form({ grant_type: "authorization_code", code: c.code, client_id: "sfc_erfunden.x", code_verifier: VERIFIER })).status).toBe(401);
    // nach einer Stunde ist der Zugangsschlüssel abgelaufen
    const tok = await (await s.form({ grant_type: "authorization_code", code: c.code, client_id: c.clientId, code_verifier: VERIFIER })).json() as Record<string, string>;
    expect(await verifyAccess(s.deps, tok.access_token)).not.toBeNull();
    expect(await verifyAccess({ ...s.deps, now: Date.now() + 3601_000 }, tok.access_token)).toBeNull();
    // gesperrt über MCP_REVOKED
    const id = [...s.grants.docs.keys()][0];
    expect(await verifyAccess({ ...s.deps, revoked: x => x === id }, tok.access_token)).toBeNull();
    // ein persönlicher Schlüssel ist kein Zugangsschlüssel
    expect(await verifyAccess(s.deps, "sf_abc.def")).toBeNull();
  });

  it("Weiterleitung: nur bekannte Rücksprung-Adressen, PKCE Pflicht, Ablehnen", async () => {
    const s = setup();
    const reg = await (await s.post("/oauth/register", { client_name: "Claude", redirect_uris: [CB] })).json() as { client_id: string };
    const base = { response_type: "code", client_id: reg.client_id, code_challenge: await challenge(), code_challenge_method: "S256", state: "x" };
    // fremde Adresse: keine Weiterleitung, nur Hinweis
    const evil = await s.call(`/oauth/authorize?${new URLSearchParams({ ...base, redirect_uri: "https://evil.example/cb" })}`);
    expect(evil.status).toBe(400);
    expect(evil.headers.get("location")).toBeNull();
    expect((await s.call(`/oauth/authorize?${new URLSearchParams({ ...base, client_id: "sfc_x.y" })}`)).status).toBe(400);
    // ohne PKCE: zurück mit Fehler
    const plain = await s.call(`/oauth/authorize?${new URLSearchParams({ ...base, code_challenge_method: "plain" })}`);
    expect(new URL(plain.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
    // Ablehnen in der App
    const ok = await s.call(`/oauth/authorize?${new URLSearchParams(base)}`);
    const req = new URL(ok.headers.get("location")!).searchParams.get("verbinden")!;
    const no = await (await s.post("/oauth/approve", { req, allow: false }, "tok-dani")).json() as { redirect: string };
    expect(new URL(no.redirect).searchParams.get("error")).toBe("access_denied");
    expect(s.grants.docs.size).toBe(0);
    // ohne Anmeldung bzw. von fremder Seite
    expect((await s.post("/oauth/approve", { req, allow: true })).status).toBe(401);
    expect((await s.call("/oauth/approve", { method: "POST", body: "{}" }, { appCors: {} })).status).toBe(403);
    // abgelaufene Anfrage
    const late = await s.call("/oauth/approve", { method: "POST", headers: { authorization: "Bearer tok-dani" }, body: JSON.stringify({ req, allow: true }) }, { now: Date.now() + 601_000 });
    expect(late.status).toBe(400);
  });

  it("Chat-Apps mit Geheimnis: wird ausgegeben und geprüft (auch per Basic)", async () => {
    const s = setup();
    const reg = await (await s.post("/oauth/register", { client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "client_secret_post" })).json() as Record<string, string>;
    expect(reg.token_endpoint_auth_method).toBe("client_secret_post");
    expect(reg.client_secret).toBeTruthy();
    const wrong = await s.call("/oauth/token", { method: "POST", headers: { authorization: `Basic ${btoa(`${reg.client_id}:falsch`)}` }, body: "grant_type=refresh_token&refresh_token=x" });
    expect(wrong.status).toBe(401);
    const right = await s.call("/oauth/token", { method: "POST", headers: { authorization: `Basic ${btoa(`${reg.client_id}:${reg.client_secret}`)}` }, body: "grant_type=refresh_token&refresh_token=x" });
    expect(await right.json()).toMatchObject({ error: "invalid_grant" });
  });
});
