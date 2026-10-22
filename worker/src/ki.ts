/*
 * KI-Anbieter für Planer und Kontoeinrichtung: Claude (Anthropic), wenn ANTHROPIC_API_KEY gesetzt ist, sonst Gemini.
 * Mit beiden Schlüsseln springt Gemini ein, wenn Claude beim ersten Aufruf einer Anfrage nicht antwortet (überlastet,
 * Zeitüberschreitung, Serverfehler). Danach bleibt die Anfrage beim Anbieter, der geantwortet hat: die Verläufe der
 * beiden passen nicht zueinander (Denkblöcke, Signaturen).
 */
import { claudeCaller, CLAUDE_MODEL } from "./claude";
import { geminiCaller } from "./gemini";

export interface KiEnv {
  /** Schlüssel aus der Claude Console (Secret); gesetzt = Claude ist der erste Anbieter */
  ANTHROPIC_API_KEY?: string;
  /** Standard claude-haiku-5-5 */
  CLAUDE_MODEL?: string;
  /** Denktiefe von Claude: low, medium (Standard), high */
  CLAUDE_EFFORT?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
}

/** ältere Modelle (gemini-2.5-flash) gibt Google neuen Konten nicht mehr; mit GEMINI_MODEL überschreibbar */
export const GEMINI_DEFAULT = "gemini-3.8-flash";

/** Modelle in der Reihenfolge, in der sie gefragt werden (für Protokoll und Admin-Ansicht) */
export function kiModels(env: KiEnv): string[] {
  return [
    ...(env.ANTHROPIC_API_KEY ? [env.CLAUDE_MODEL || CLAUDE_MODEL] : []),
    ...(env.GEMINI_API_KEY ? [env.GEMINI_MODEL || GEMINI_DEFAULT, ...(env.GEMINI_FALLBACK_MODEL ? [env.GEMINI_FALLBACK_MODEL] : [])] : [])
  ];
}

export const kiReady = (env: KiEnv) => !!(env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY);

/** Fehler, bei denen der andere Anbieter es versuchen darf (auch Guthaben leer oder Limit erreicht, 402; nicht bei ungültiger Anfrage oder falschem Schlüssel) */
export const switchable = (msg: string) => /^KI-Fehler (402|429|500|502|503|504|524) /.test(msg) || /^KI-Fehler: keine Antwort/.test(msg);

export function kiCaller(env: KiEnv, o: { f?: typeof fetch; onCall?: () => void; sleep?: (ms: number) => Promise<void>; timeoutMs?: number } = {}) {
  const callers: ((p: object) => Promise<unknown>)[] = [];
  if (env.ANTHROPIC_API_KEY) callers.push(claudeCaller({ key: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL || CLAUDE_MODEL, effort: env.CLAUDE_EFFORT, ...o }));
  if (env.GEMINI_API_KEY) callers.push(geminiCaller({ key: env.GEMINI_API_KEY, models: [env.GEMINI_MODEL || GEMINI_DEFAULT, env.GEMINI_FALLBACK_MODEL || ""], ...o }));
  let chosen: ((p: object) => Promise<unknown>) | undefined;
  return async (payload: object): Promise<unknown> => {
    if (chosen) return chosen(payload);
    let last: Error = new Error("KI-Fehler: kein Anbieter eingerichtet");
    for (const call of callers) {
      try {
        const res = await call(payload);
        chosen = call;
        return res;
      } catch (e) {
        last = e as Error;
        if (!switchable(last.message)) throw last;
      }
    }
    throw last;
  };
}
