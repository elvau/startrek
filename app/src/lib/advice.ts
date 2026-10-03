/*
 * Reise- und Sicherheitshinweise des Auswärtigen Amts (OpenData-Schnittstelle, alle Länder): Warnstufen je Land und
 * Link zur Länderseite. Der Such-Dienst holt die Liste (/advice, einige Stunden zwischengespeichert), die App zeigt sie.
 */
export interface Advice {
  id: string;
  name: string;
  /** Reisewarnung, Teilreisewarnung, Sicherheitshinweis (ganzes Land / Teile) */
  warning: boolean;
  partial: boolean;
  situation: boolean;
  situationPart: boolean;
  /** zuletzt geändert (JJJJ-MM-TT) */
  modified?: string;
}
export type AdviceMap = Record<string, Advice>;

export const AA_LIST = "https://www.auswaertiges-amt.de/opendata/travelwarning";
export const adviceUrl = (a: Advice) => `https://www.auswaertiges-amt.de/de/ReiseUndSicherheit/${encodeURIComponent(a.id)}`;

/** Liste der Schnittstelle → je Land (ISO-2); unbekannte Felder werden ignoriert */
export function parseAdvice(data: unknown): AdviceMap {
  const out: AdviceMap = {};
  const root = (data as { response?: unknown })?.response ?? data;
  if (!root || typeof root !== "object") return out;
  for (const [id, v] of Object.entries(root as Record<string, unknown>)) {
    const x = v as Record<string, unknown>;
    const cc = typeof x?.countryCode === "string" ? x.countryCode.toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(cc)) continue;
    const ms = typeof x.lastModified === "number" ? (x.lastModified < 1e11 ? x.lastModified * 1000 : x.lastModified) : NaN;
    out[cc] = {
      id, name: String(x.countryName || cc),
      warning: !!x.warning, partial: !!x.partialWarning, situation: !!x.situationWarning, situationPart: !!x.situationPartWarning,
      ...(isFinite(ms) ? { modified: new Date(ms).toISOString().slice(0, 10) } : {})
    };
  }
  return out;
}

/** stärkste Stufe für die Anzeige */
export const adviceLevel = (a?: Advice): "warning" | "partial" | "situation" | null =>
  !a ? null : a.warning ? "warning" : a.partial ? "partial" : a.situation || a.situationPart ? "situation" : null;
