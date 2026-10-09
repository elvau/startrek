/*
 * Aufruf an Gemini (generateContent) mit Wiederholung: Ist das Modell überlastet (503) oder kommen zu viele Anfragen (429),
 * nach 1 und 3 Sekunden noch einmal, danach das nächste Modell: GEMINI_FALLBACK_MODEL, sonst ein anderes Flash-Modell aus
 * der Liste, die Google für den Schlüssel anbietet. Ein Modell, das es nicht (mehr) gibt (404), wird gleich übersprungen,
 * ebenso eins, das nicht rechtzeitig antwortet (504, 524): das noch einmal zu versuchen, hieße wieder lange warten.
 * Hat ein Modell geantwortet, bleiben die weiteren Runden derselben Anfrage dabei.
 */
export interface GeminiOpts {
  key: string;
  /** Modelle in dieser Reihenfolge, z. B. [GEMINI_MODEL, GEMINI_FALLBACK_MODEL] */
  models: string[];
  f?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** vor jedem Aufruf (Zähler für das Anfragelimit von Cloudflare) */
  onCall?: () => void;
  delays?: number[];
  /** weitere Modelle suchen, wenn alle genannten überlastet sind (Standard: Liste von Google) */
  discover?: () => Promise<string[]>;
  /** höchstens so lange auf eine Antwort warten (Standard 40 s), dann das nächste Modell */
  timeoutMs?: number;
}

const RETRY = new Set([429, 500, 502, 503]);
/** Zeitüberschreitung: gleich das nächste Modell statt Wiederholung */
const TIMEOUT = new Set([504, 524]);
const API = "https://generativelanguage.googleapis.com/v1beta";

/** Fehlermeldung von tryModel: Modell überlastet oder Anfragelimit (429, 503) */
export const isOverloaded = (msg: string) => /^KI-Fehler (429|503) /.test(msg);

/** Flash-Modelle, die der Schlüssel für Text nutzen darf, neueste zuerst (ohne Bild, Audio, Live, Embedding) */
export function pickModels(list: { name?: string; supportedGenerationMethods?: string[] }[], skip: string[]): string[] {
  const num = (s: string) => (s.match(/\d+(\.\d+)?/)?.[0] ? parseFloat(s.match(/\d+(\.\d+)?/)![0]) : 0);
  return list
    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
    .map(m => String(m.name || "").replace(/^models\//, ""))
    .filter(n => /flash/.test(n) && !/image|audio|tts|live|embed|thinking-exp|native/.test(n) && !skip.includes(n))
    .sort((a, b) => num(b) - num(a) || Number(/lite/.test(a)) - Number(/lite/.test(b)))
    .slice(0, 2);
}

/** Liste der Modelle von Google (je Isolat einmal, eine Stunde gültig) */
let listed: { at: number; names: { name?: string; supportedGenerationMethods?: string[] }[] } | null = null;
export async function listModels(key: string, f: typeof fetch = fetch, onCall?: () => void) {
  if (listed && Date.now() - listed.at < 3600_000) return listed.names;
  onCall?.();
  const res = await f(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  const data = await res.json().catch(() => ({})) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  listed = { at: Date.now(), names: data.models || [] };
  return listed.names;
}

/** Aufrufer für eine KI-Anfrage (mehrere Runden): merkt sich das Modell, das zuletzt geantwortet hat */
export function geminiCaller(o: GeminiOpts) {
  const f = o.f || fetch;
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const delays = o.delays || [0, 1000, 3000];
  const discover = o.discover || (async () => pickModels(await listModels(o.key, f, o.onCall), o.models));
  let working = "";

  async function tryModel(model: string, payload: object): Promise<{ ok: true; data: unknown } | { ok: false; error: string; retry: boolean }> {
    let error = "";
    for (const wait of delays) {
      if (wait) await sleep(wait);
      o.onCall?.();
      let res: Response;
      try {
        res = await f(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": o.key }, body: JSON.stringify(payload),
          signal: AbortSignal.timeout(o.timeoutMs ?? 40000)
        });
      } catch (e) {
        // Zeitüberschreitung oder Netzfehler: nächstes Modell
        return { ok: false, error: `KI-Fehler: keine Antwort (${model}, ${(e as Error).name})`, retry: true };
      }
      const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
      if (res.ok) return { ok: true, data };
      error = `KI-Fehler ${res.status} (${model})${data.error?.message ? `: ${data.error.message}` : ""}`;
      if (res.status === 404 || TIMEOUT.has(res.status)) return { ok: false, error, retry: true };
      if (!RETRY.has(res.status)) return { ok: false, error, retry: false };
    }
    return { ok: false, error, retry: true };
  }

  return async (payload: object): Promise<unknown> => {
    const tried = new Set<string>();
    let last = "";
    const queue = [working, ...o.models].filter(Boolean);
    let discovered = false;
    while (true) {
      const model = queue.shift();
      if (!model) {
        // alle genannten überlastet oder weg: einmal bei Google nach weiteren Flash-Modellen fragen
        if (discovered) break;
        discovered = true;
        queue.push(...(await discover().catch(() => [] as string[])).filter(m => !tried.has(m)));
        continue;
      }
      if (tried.has(model)) continue;
      tried.add(model);
      const r = await tryModel(model, payload);
      if (r.ok) { working = model; return r.data; }
      last = r.error;
      if (!r.retry) throw new Error(last);
    }
    throw new Error(last || "KI-Fehler: kein Modell eingerichtet");
  };
}

/** einzelner Aufruf (ohne Gedächtnis über Runden) */
export const callGemini = (payload: object, o: GeminiOpts) => geminiCaller(o)(payload);
