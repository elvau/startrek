/* Touren und Tickets: Quellen fragen (bisher Viator), nach Bewertung sortieren; Anfrage prüfen (im Such-Dienst) */
import { partnerOn } from "../partner";
import type { SourceStatus } from "../flights/types";
import { searchViator } from "./viator";
import type { ActivityEnv, ActivityHit, ActivityQuery, ActivitySearchResult } from "./types";
import { errorText } from "../netcheck";

/**
 * Viator-Bedingungen (docs/EVENT.md): Inhalte nur auf der eigenen Domain und nur, um Partner-Traffic zu viator.com zu
 * leiten. Gesperrt: andere Herkunft (Testumgebung), Partner-Links aus. Der KI-Konnektor (fremde Anwendung) hat keine Touren.
 */
export const VIATOR_ORIGINS = ["https://splitandfly.com", "https://www.splitandfly.com", "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"];
export type ViatorBlock = "domain" | "partner";
export function viatorBlock(origin: string | null, env: ActivityEnv): ViatorBlock | null {
  if (!partnerOn(env)) return "partner";
  if (!origin || !VIATOR_ORIGINS.includes(origin)) return "domain";
  return null;
}
/** Ergebnis ohne Suche, wenn Viator hier nicht gezeigt werden darf (error: Grund für die App) */
export const blockedResult = (why: ViatorBlock): ActivitySearchResult => ({ activities: [], sources: [{ id: "viator", name: "Viator", configured: false, ok: false, count: 0, error: why }] });

export async function searchActivities(q: ActivityQuery, env: ActivityEnv = {}, f: typeof fetch = fetch, timeoutMs = 20000): Promise<ActivitySearchResult> {
  if (!env.VIATOR_API_KEY) return { activities: [], sources: [{ id: "viator", name: "Viator", configured: false, ok: false, count: 0 }] };
  const t0 = Date.now();
  try {
    const list = await Promise.race([searchViator(q, env.VIATOR_API_KEY, f, partnerOn(env)), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`keine Antwort nach ${timeoutMs / 1000} s`)), timeoutMs))]);
    const sources: SourceStatus[] = [{ id: "viator", name: "Viator", configured: true, ok: true, count: list.length, ms: Date.now() - t0 }];
    return { activities: rank(list), sources };
  } catch (e) {
    return { activities: [], sources: [{ id: "viator", name: "Viator", configured: true, ok: false, count: 0, ms: Date.now() - t0, error: errorText(e) }] };
  }
}

/** gut und oft bewertet zuerst (Bewertung, bei wenigen Bewertungen abgewertet) */
export function rank(list: ActivityHit[]): ActivityHit[] {
  const score = (a: ActivityHit) => (a.rating || 0) * Math.min(1, (a.reviews || 0) / 50);
  return [...list].sort((a, b) => score(b) - score(a));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseActivityQuery(b: unknown): ActivityQuery | string {
  const o = (b || {}) as Record<string, unknown>;
  const place = typeof o.place === "string" ? o.place.trim() : "";
  if (place.length < 2 || place.length > 60) return "Ort angeben (2 bis 60 Zeichen)";
  const from = typeof o.from === "string" && o.from ? o.from : undefined, to = typeof o.to === "string" && o.to ? o.to : undefined;
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return "Datum im Format JJJJ-MM-TT";
  if (from && to && to < from) return "Zeitraum endet vor dem Anfang";
  const lang = typeof o.lang === "string" && /^[a-z]{2}$/.test(o.lang) ? o.lang : undefined;
  return { place, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(lang ? { lang } : {}) };
}
