/* Angaben von Anbietern aufbereiten: technische Platzhalter („undefined“, „null“, „TBA“) sind kein Ort */
import type { EventHit } from "./types";

const EMPTY = new Set(["undefined", "null", "none", "nan", "n/a", "na", "-", "tba", "tbd", "tbc", "to be announced", "to be determined"]);

/** Text, sonst undefined (leer oder Platzhalter vom Anbieter) */
export function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return !s || EMPTY.has(s.toLowerCase()) ? undefined : s;
}

/** Treffer ohne Platzhalter in Ort, Stadion, Anschrift und Kategorie (fehlende Angabe = Feld fehlt) */
export function cleanHit(h: EventHit): EventHit {
  const out: EventHit = { ...h };
  for (const k of ["venue", "city", "address", "category"] as const) {
    const v = cleanText(h[k]);
    if (v === undefined) delete out[k]; else out[k] = v;
  }
  return out;
}
