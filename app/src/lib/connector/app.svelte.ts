/* KI-Konnektor (MCP) in der App: persönlichen Schlüssel beim Such-Dienst erzeugen (wird nirgends gespeichert) */
import { i18n, t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { cloud, idToken } from "../cloud/cloud.svelte";

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
  if (!res.ok) throw new Error(res.status === 503 ? t("mcp.notReady") : res.status === 429 ? t("mcp.tooMany") : i18n.lang === "de" && data.error ? data.error : t("search.status", { s: res.status }));
  return data as NewKey;
}

/** Adresse des MCP-Servers (für jedes Programm mit MCP über HTTP) */
export const MCP_URL = `${FLIGHTS_URL}/mcp`;

/** Beispiel: Befehl für Claude Code */
export const claudeCommand = (key: string) => `claude mcp add --transport http splitandfly ${MCP_URL} --header "Authorization: Bearer ${key}"`;
