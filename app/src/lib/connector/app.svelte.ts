/* KI-Konnektor (MCP) in der App: persönlichen Schlüssel beim Such-Dienst erzeugen (wird nirgends gespeichert) */
import { t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { cloud, idToken } from "../cloud/cloud.svelte";
import { serverError } from "../neterror";

export const connect = $state({ open: false });

export interface NewKey { key: string; kid: string; trips: boolean }

export async function createKey(): Promise<NewKey> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new Error(t("ai.needLogin"));
  const res = await fetch(`${FLIGHTS_URL}/mcp/key`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: cloud.user?.name || "" })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 503 ? t("mcp.notReady") : res.status === 429 ? t("mcp.tooMany") : serverError(data, res.status));
  return data as NewKey;
}

/** Adresse des MCP-Servers (für jedes Programm mit MCP über HTTP) */
export const MCP_URL = `${FLIGHTS_URL}/mcp`;

/** Beispiel: Befehl für Claude Code */
export const claudeCommand = (key: string) => `claude mcp add --transport http splitandfly ${MCP_URL} --header "Authorization: Bearer ${key}"`;

/* ---------- Chat-Apps per OAuth (#590): Zustimmung und verbundene KI-Assistenten ---------- */

/** Anfrage einer Chat-App: der Such-Dienst leitet auf ?verbinden=… um (signiert, die App liest nur Name, Ziel und Ablauf) */
export interface ConsentInfo { req: string; client: string; host: string; until: number }
export const consent = $state<{ info: ConsentInfo | null }>({ info: null });

const PENDING = "sf-verbinden";

export function parseConsent(req: string): ConsentInfo | null {
  try {
    const b = atob(req.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"));
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))));
    if (typeof p.n !== "string" || typeof p.h !== "string" || typeof p.x !== "number") return null;
    return { req, client: p.n.slice(0, 60), host: p.h.slice(0, 100), until: p.x };
  } catch { return null; }
}

/** beim Start: Anfrage aus der Adresse (bzw. nach einer Anmeldung mit Weiterleitung aus dem Sitzungsspeicher) */
export function readConsent() {
  const u = new URL(location.href);
  let req = u.searchParams.get("verbinden");
  if (req) {
    u.searchParams.delete("verbinden");
    history.replaceState(null, "", u);
    try { sessionStorage.setItem(PENDING, req); } catch {}
  } else { try { req = sessionStorage.getItem(PENDING); } catch {} }
  consent.info = req ? parseConsent(req) : null;
}

export function closeConsent() {
  consent.info = null;
  try { sessionStorage.removeItem(PENDING); } catch {}
}

async function oauthCall(path: string, body?: object): Promise<Record<string, unknown>> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new Error(t("oauth.loginFirst"));
  const res = await fetch(`${FLIGHTS_URL}${path}`, body
    ? { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }
    : { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 503 ? t("mcp.notReady") : res.status === 400 && data.code === "oauth_expired" ? t("oauth.expired") : serverError(data, res.status));
  return data;
}

/** Erlauben oder Ablehnen; gibt die Adresse zurück, unter der es in der Chat-App weitergeht */
export async function answerConsent(allow: boolean): Promise<string> {
  const data = await oauthCall("/oauth/approve", { req: consent.info!.req, allow });
  closeConsent();
  return String(data.redirect);
}

export interface Connection { id: string; client: string; host: string; at: string; used: string }

export async function listConnections(): Promise<Connection[]> {
  return ((await oauthCall("/oauth/grants")).grants as Connection[]) || [];
}

export async function removeConnection(id: string): Promise<void> {
  await oauthCall("/oauth/grants/remove", { id });
}
