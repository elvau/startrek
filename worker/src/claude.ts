/*
 * Claude (Anthropic Messages API) als KI-Anbieter für Planer, Kontoeinrichtung und Import. Planer und Einrichtung bauen ihre
 * Anfragen im Format von Gemini (systemInstruction, contents, functionDeclarations); hier wird das in eine Anfrage an
 * /v1/messages übersetzt und die Antwort zurück ins Gemini-Format. So bleibt der Ablauf des Planers für beide gleich.
 * Bewusst ohne SDK: Cloudflare baut den Dienst ohne Installationsschritt (wie bei Gemini, nur fetch).
 *
 * Denkblöcke (thinking) müssen mit den Werkzeug-Ergebnissen unverändert zurück: die Antwort trägt die rohen Blöcke
 * deshalb in `_claude`, und die nächste Runde schickt genau diese wieder mit. Der Verlauf wird nur angehängt, nie
 * geändert (sonst lehnt Claude die Denkblöcke ab).
 */

export interface ClaudeOpts {
  key: string;
  /** Standard claude-haiku-5-5 */
  model?: string;
  f?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** vor jedem Aufruf (Zähler für das Anfragelimit von Cloudflare) */
  onCall?: () => void;
  delays?: number[];
  /** höchstens so lange auf eine Antwort warten (Standard 40 s) */
  timeoutMs?: number;
  /** Denktiefe: low, medium (Standard), high */
  effort?: string;
}

export const CLAUDE_MODEL = "claude-haiku-5-5";
const API = "https://api.anthropic.com/v1/messages";
/** überlastet (529), Anfragelimit (429), Serverfehler: kurz warten und noch einmal */
const RETRY = new Set([429, 500, 502, 503, 529]);

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Schema von Gemini (Typen in Großbuchstaben) → JSON Schema */
export function toSchema(s: any): any {
  if (!s || typeof s !== "object") return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "type" && typeof v === "string") out.type = v.toLowerCase();
    else if (k === "properties" && v && typeof v === "object") out.properties = Object.fromEntries(Object.entries(v).map(([n, p]) => [n, toSchema(p)]));
    else if (k === "items") out.items = toSchema(v);
    else out[k] = v;
  }
  return out;
}

/** Anfrage im Gemini-Format → Anfrage an Claude */
export function toClaude(body: any, model: string, effort?: string): any {
  const system = (body?.systemInstruction?.parts || []).map((p: any) => p.text || "").join("\n");
  const decls: any[] = (body?.tools || []).flatMap((t: any) => t.functionDeclarations || []);
  const tools = decls.map(d => ({ name: d.name, description: d.description || "", input_schema: toSchema(d.parameters || { type: "OBJECT", properties: {} }) }));
  const messages: any[] = [];
  /** Kennungen der Werkzeugaufrufe der letzten Antwort, der Reihe nach für die Ergebnisse */
  let pending: string[] = [];
  let n = 0;
  for (const c of body?.contents || []) {
    const parts: any[] = c.parts || [];
    if (c.role === "model") {
      const raw: any[] = Array.isArray(c._claude) ? c._claude : parts.map(p => (p.functionCall ? { type: "tool_use", id: `call_${++n}`, name: p.functionCall.name, input: p.functionCall.args || {} } : { type: "text", text: p.text || "" })).filter(b => b.type !== "text" || b.text);
      pending = raw.filter(b => b.type === "tool_use").map(b => b.id);
      messages.push({ role: "assistant", content: raw });
      continue;
    }
    // Ergebnisse zuerst (Claude verlangt sie am Anfang der Nachricht), dann Text
    const results = parts.filter(p => p.functionResponse).flatMap((p, i) => (pending[i] ? [{ type: "tool_result", tool_use_id: pending[i], content: JSON.stringify(p.functionResponse.response ?? {}) }] : []));
    const texts = parts.filter(p => typeof p.text === "string" && p.text).map(p => ({ type: "text", text: p.text }));
    // Bilder und PDF (Reise importieren, #457) vor dem Text, wie es Anthropic empfiehlt
    const media = parts.filter(p => p.inlineData?.data).map(p => ({
      type: p.inlineData.mimeType === "application/pdf" ? "document" : "image",
      source: { type: "base64", media_type: p.inlineData.mimeType, data: p.inlineData.data }
    }));
    pending = [];
    if (results.length || media.length || texts.length) messages.push({ role: "user", content: [...results, ...media, ...texts] });
  }
  // nur ein erlaubtes Werkzeug (letzte Runde, Kontoeinrichtung): genau dieses aufrufen; sonst frei, damit Claude vorher denkt
  const only: string[] = body?.toolConfig?.functionCallingConfig?.allowedFunctionNames || [];
  return {
    model, max_tokens: 16000, system, messages,
    ...(tools.length ? { tools, tool_choice: only.length === 1 ? { type: "tool", name: only[0] } : { type: "auto" } } : {}),
    // ganze Unterhaltung zwischenspeichern: jede Runde liest die vorigen günstig (0,1 × Eingabepreis)
    cache_control: { type: "ephemeral" },
    ...(effort ? { output_config: { effort } } : {})
  };
}

/** Antwort von Claude → Antwort im Gemini-Format; die rohen Blöcke gehen in der nächsten Runde unverändert zurück */
export function fromClaude(res: any): any {
  const content: any[] = Array.isArray(res?.content) ? res.content : [];
  const parts = content.flatMap((b): any[] => (b.type === "tool_use" ? [{ functionCall: { name: b.name, args: b.input || {} } }] : b.type === "text" && b.text ? [{ text: b.text }] : []));
  return { candidates: [{ content: { role: "model", parts, _claude: content }, finishReason: res?.stop_reason }] };
}

/** Aufrufer im Stil von geminiCaller: Anfrage im Gemini-Format rein, Antwort im Gemini-Format raus */
export function claudeCaller(o: ClaudeOpts) {
  const f = o.f || fetch;
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const delays = o.delays || [0, 1000, 3000];
  const model = o.model || CLAUDE_MODEL;
  return async (payload: object): Promise<unknown> => {
    const body = JSON.stringify(toClaude(payload, model, o.effort));
    let error = "";
    for (const wait of delays) {
      if (wait) await sleep(wait);
      o.onCall?.();
      let res: Response;
      try {
        res = await f(API, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": o.key, "anthropic-version": "2023-06-01" },
          body, signal: AbortSignal.timeout(o.timeoutMs ?? 40000)
        });
      } catch (e) {
        throw new Error(`KI-Fehler: keine Antwort (${model}, ${(e as Error).name})`);
      }
      const data = await res.json().catch(() => ({})) as any;
      if (res.ok) {
        // Ablehnung durch die Sicherheitsprüfung: keine Antwort, die der Planer verwenden kann
        if (data?.stop_reason === "refusal") throw new Error(`KI-Fehler: Anfrage abgelehnt (${model})`);
        return fromClaude(data);
      }
      // 529 heißt bei Anthropic „überlastet“ wie 503 bei Google: gleiche Meldung, damit die App ihre eigene zeigt
      const status = res.status === 529 ? 503 : res.status;
      error = `KI-Fehler ${status} (${model})${data?.error?.message ? `: ${data.error.message}` : ""}`;
      if (!RETRY.has(res.status)) throw new Error(error);
    }
    throw new Error(error);
  };
}
