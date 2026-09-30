/* Touren und Tickets: Quellen fragen (bisher Viator), nach Bewertung sortieren; Anfrage prüfen (im Such-Dienst) */
import type { SourceStatus } from "../flights/types";
import { searchViator } from "./viator";
import type { ActivityEnv, ActivityHit, ActivityQuery, ActivitySearchResult } from "./types";

export async function searchActivities(q: ActivityQuery, env: ActivityEnv = {}, f: typeof fetch = fetch, timeoutMs = 20000): Promise<ActivitySearchResult> {
  if (!env.VIATOR_API_KEY) return { activities: [], sources: [{ id: "viator", name: "Viator", configured: false, ok: false, count: 0 }] };
  const t0 = Date.now();
  try {
    const list = await Promise.race([searchViator(q, env.VIATOR_API_KEY, f), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`keine Antwort nach ${timeoutMs / 1000} s`)), timeoutMs))]);
    const sources: SourceStatus[] = [{ id: "viator", name: "Viator", configured: true, ok: true, count: list.length, ms: Date.now() - t0 }];
    return { activities: rank(list), sources };
  } catch (e) {
    return { activities: [], sources: [{ id: "viator", name: "Viator", configured: true, ok: false, count: 0, ms: Date.now() - t0, error: (e as Error).message }] };
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
