/* Kleiner MCP-Client (Streamable HTTP) für öffentliche Such-Server wie Kiwi.com oder Trivago */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** JSON-RPC-Antwort lesen: als JSON oder als Server-Sent Events */
async function rpc(res: Response, name: string): Promise<any> {
  if (!res.ok) throw new Error(`${name} antwortet mit ${res.status}`);
  const text = await res.text();
  if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
    const msgs = text.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean);
    return msgs.find(m => "result" in m || "error" in m) ?? msgs.at(-1);
  }
  return text ? JSON.parse(text) : null;
}

/** Verbindung aufbauen: initialize → initialized; gibt die Kopfzeilen für weitere Aufrufe zurück */
async function connect(url: string, name: string, fetchFn: typeof fetch): Promise<Record<string, string>> {
  const base = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  const init = await fetchFn(url, { method: "POST", headers: base, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "reisekasse", version: "1.0" } }
  }) });
  const session = init.headers.get("mcp-session-id");
  const hello = await rpc(init, name);
  if (hello?.error) throw new Error(hello.error.message || `${name}: Verbindung abgelehnt`);
  const headers: Record<string, string> = { ...base, ...(session ? { "mcp-session-id": session } : {}) };
  await fetchFn(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  return headers;
}

/** tools/call in einer bestehenden Verbindung: strukturierte Daten (structuredContent, sonst der JSON-Text der Antwort) */
async function call(url: string, headers: Record<string, string>, id: number, tool: string, args: unknown, name: string, fetchFn: typeof fetch): Promise<any> {
  const res = await rpc(await fetchFn(url, { method: "POST", headers, body: JSON.stringify({
    jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args }
  }) }), name);
  if (res?.error) throw new Error(res.error.message || `${name}: Fehler bei der Suche`);
  const r = res?.result;
  if (r?.isError) throw new Error(r.content?.find((c: any) => c.type === "text")?.text || `${name}: Fehler bei der Suche`);
  if (r?.structuredContent) return r.structuredContent;
  const text = r?.content?.find((c: any) => c.type === "text")?.text;
  try { return JSON.parse(text || "{}"); } catch { throw new Error(`${name}: Antwort nicht lesbar`); }
}

/**
 * Ein Werkzeug aufrufen: initialize → initialized → tools/call.
 * Gibt die strukturierten Daten zurück (structuredContent, sonst der JSON-Text der Antwort).
 */
export async function callTool(url: string, tool: string, args: unknown, name: string, fetchFn: typeof fetch = fetch): Promise<any> {
  return call(url, await connect(url, name, fetchFn), 2, tool, args, name, fetchFn);
}

/** mehrere Aufrufe in einer Verbindung (spart Anfragen), gleichzeitig; ein fehlgeschlagener Aufruf ergibt null */
export async function callTools(url: string, calls: { tool: string; args: unknown }[], name: string, fetchFn: typeof fetch = fetch): Promise<any[]> {
  const headers = await connect(url, name, fetchFn);
  return Promise.all(calls.map((c, i) => call(url, headers, i + 2, c.tool, c.args, name, fetchFn).catch(() => null)));
}
