/*
 * Aufruf an Gemini (generateContent) mit Wiederholung: Ist das Modell überlastet (503) oder kommen zu viele Anfragen (429),
 * nach 1 und 3 Sekunden noch einmal, danach das Ausweichmodell (falls eingerichtet). Ein Modell, das es nicht (mehr) gibt
 * (404), wird gleich übersprungen.
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
}

const RETRY = new Set([429, 500, 503]);

export async function callGemini(payload: object, o: GeminiOpts): Promise<unknown> {
  const f = o.f || fetch;
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const delays = o.delays || [0, 1000, 3000];
  let last = "";
  for (const model of o.models.filter(Boolean)) {
    for (const wait of delays) {
      if (wait) await sleep(wait);
      o.onCall?.();
      const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": o.key }, body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
      if (res.ok) return data;
      last = `KI-Fehler ${res.status} (${model})${data.error?.message ? `: ${data.error.message}` : ""}`;
      if (res.status === 404) break;
      if (!RETRY.has(res.status)) throw new Error(last);
    }
  }
  throw new Error(last || "KI-Fehler: kein Modell eingerichtet");
}
