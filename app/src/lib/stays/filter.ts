/*
 * Treffer der Unterkunftssuche filtern, ohne neue Anfrage: Preis pro Person und Nacht, Bewertung, Sterne,
 * Verpflegung, Ausstattung, Entfernung zum Zentrum, Quelle. Zu jeder Auswahl Anzahl und Preis ab.
 */
import { kmBetween } from "../geo/places";
import { hasCoords } from "../geo/maps";
import { centerKm } from "./sort";
import type { StayOffer } from "./types";

export interface StayFilter {
  /** höchstens so viel pro Person und Nacht; null: egal */
  maxPpn: number | null;
  minScore: number | null;
  minStars: number | null;
  /** höchstens so weit vom Zentrum (km) */
  maxKm: number | null;
  /** muss alles davon haben (z. B. Pool, Küche) */
  facts: string[];
  /** Frühstück oder mehr */
  breakfast: boolean;
  /** nur diese Quellen; leer: alle */
  sources: string[];
}

export const noStayFilter = (): StayFilter => ({ maxPpn: null, minScore: null, minStars: null, maxKm: null, facts: [], breakfast: false, sources: [] });

/** Rechengrößen der Suche: Nächte, Personen und Mittelpunkt des Orts (für die Entfernung) */
export interface StayCtx { nights: number; people: number; center?: { lat: number; lon: number } | null }

export const ppn = (o: StayOffer, c: StayCtx) => o.total / Math.max(1, c.nights) / Math.max(1, c.people);

/** Entfernung zum Zentrum: Angabe des Anbieters („0.7 km bis Zentrum“), sonst aus den Koordinaten */
export function kmToCenter(o: StayOffer, c: StayCtx): number | undefined {
  const k = centerKm(o);
  if (k != null) return k;
  return c.center && hasCoords(o) ? Math.round(kmBetween(c.center, { lat: o.lat!, lon: o.lon! }) * 10) / 10 : undefined;
}

export const SCORES = [7, 8, 9];
export const STARS = [3, 4, 5];
export const KMS = [1, 3, 5];

export function stayPasses(o: StayOffer, f: StayFilter, c: StayCtx, skip?: keyof StayFilter): boolean {
  if (skip !== "maxPpn" && f.maxPpn != null && ppn(o, c) > f.maxPpn) return false;
  if (skip !== "minScore" && f.minScore != null && (o.score ?? 0) < f.minScore) return false;
  if (skip !== "minStars" && f.minStars != null && (o.stars ?? 0) < f.minStars) return false;
  if (skip !== "maxKm" && f.maxKm != null) { const k = kmToCenter(o, c); if (k == null || k > f.maxKm) return false; }
  if (skip !== "facts" && f.facts.length && !f.facts.every(x => o.facts?.includes(x))) return false;
  if (skip !== "breakfast" && f.breakfast && (!o.board || o.board === "self")) return false;
  if (skip !== "sources" && f.sources.length && !f.sources.includes(o.source)) return false;
  return true;
}

export const applyStayFilter = (list: StayOffer[], f: StayFilter, c: StayCtx) => list.filter(o => stayPasses(o, f, c));

export function stayActive(f: StayFilter): number {
  return [f.maxPpn != null, f.minScore != null, f.minStars != null, f.maxKm != null, f.facts.length > 0, f.breakfast, f.sources.length > 0].filter(Boolean).length;
}

export interface Opt<K> { key: K; count: number; min: number }

function opts<K>(list: StayOffer[], f: StayFilter, c: StayCtx, skip: keyof StayFilter, keys: K[], hit: (o: StayOffer, k: K) => boolean): Opt<K>[] {
  const ok = list.filter(o => stayPasses(o, f, c, skip));
  return keys.map(k => {
    const xs = ok.filter(o => hit(o, k));
    return { key: k, count: xs.length, min: xs.length ? Math.min(...xs.map(o => o.total)) : 0 };
  }).filter(x => x.count > 0);
}

/** Auswahl je Filter mit Anzahl und Preis ab, gerechnet mit allen anderen Filtern */
export function stayFacets(list: StayOffer[], f: StayFilter, c: StayCtx) {
  // häufigste Ausstattung (z. B. Pool, Küche, Parkplatz), höchstens 8
  const count = new Map<string, number>();
  for (const o of list) for (const x of o.facts || []) count.set(x, (count.get(x) || 0) + 1);
  const facts = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  const ps = list.map(o => ppn(o, c));
  return {
    score: opts(list, f, c, "minScore", SCORES, (o, k) => (o.score ?? 0) >= k),
    stars: opts(list, f, c, "minStars", STARS, (o, k) => (o.stars ?? 0) >= k),
    km: opts(list, f, c, "maxKm", KMS, (o, k) => (kmToCenter(o, c) ?? Infinity) <= k),
    facts: opts(list, f, c, "facts", facts, (o, k) => !!o.facts?.includes(k)),
    breakfast: opts(list, f, c, "breakfast", [true], o => !!o.board && o.board !== "self"),
    sources: opts(list, f, c, "sources", [...new Set(list.map(o => o.source))], (o, k) => o.source === k),
    /** Spanne pro Person und Nacht (für den Regler), auf 5 € gerundet */
    ppn: ps.length ? { lo: Math.floor(Math.min(...ps) / 5) * 5, hi: Math.ceil(Math.max(...ps) / 5) * 5 } : null
  };
}
