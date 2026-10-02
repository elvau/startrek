/*
 * Treffer bei „Erlebnisse finden“ filtern, ohne neue Anfrage.
 * Events: Reisetag, Tageszeit, Art (Musik, Fußball …). Touren: Dauer, Bewertung, Preis pro Person; dazu Sortierung.
 */
import type { EventHit } from "../events/types";
import type { ActivityHit } from "./types";

export type DayPart = "am" | "pm" | "eve";
export const DAY_PARTS: DayPart[] = ["am", "pm", "eve"];

/** vormittags bis 12 Uhr, nachmittags bis 18 Uhr, abends danach; ohne Uhrzeit keine Angabe */
export function partOf(start: string): DayPart | null {
  if (start.length < 16) return null;
  const h = +start.slice(11, 13);
  return h < 12 ? "am" : h < 18 ? "pm" : "eve";
}

export interface EvFilter { day: string | null; part: DayPart | null; cats: string[] }
export const noEvFilter = (): EvFilter => ({ day: null, part: null, cats: [] });

export function evPasses(h: EventHit, f: EvFilter, skip?: keyof EvFilter): boolean {
  if (skip !== "day" && f.day && h.start.slice(0, 10) !== f.day) return false;
  if (skip !== "part" && f.part && partOf(h.start) !== f.part) return false;
  if (skip !== "cats" && f.cats.length && !(h.category && f.cats.includes(h.category))) return false;
  return true;
}

const count = <T, K>(xs: T[], key: (x: T) => K | null | undefined) => {
  const m = new Map<K, number>();
  for (const x of xs) { const k = key(x); if (k != null) m.set(k, (m.get(k) || 0) + 1); }
  return m;
};

/** Auswahl mit Anzahl, gerechnet mit den anderen Filtern; Tage in Reihenfolge, Arten nach Häufigkeit */
export function evFacets(list: EventHit[], f: EvFilter) {
  const days = count(list.filter(h => evPasses(h, f, "day")), h => h.start.slice(0, 10));
  const parts = count(list.filter(h => evPasses(h, f, "part")), h => partOf(h.start));
  const cats = count(list.filter(h => evPasses(h, f, "cats")), h => h.category);
  return {
    days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, n]) => ({ key, count: n })),
    parts: DAY_PARTS.filter(p => parts.has(p)).map(p => ({ key: p, count: parts.get(p)! })),
    cats: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, n]) => ({ key, count: n }))
  };
}

export type TourLen = "short" | "half" | "day";
export const TOUR_LENS: TourLen[] = ["short", "half", "day"];
/** bis 2 Stunden, bis 5 Stunden (halber Tag), länger */
export const lenOf = (min?: number): TourLen | null => (min == null ? null : min <= 120 ? "short" : min <= 300 ? "half" : "day");

export interface TourFilter { len: TourLen | null; minRating: number | null; maxPrice: number | null }
export const noTourFilter = (): TourFilter => ({ len: null, minRating: null, maxPrice: null });
export type TourSort = "default" | "popular" | "rating" | "price" | "short";

export function tourPasses(a: ActivityHit, f: TourFilter, skip?: keyof TourFilter): boolean {
  if (skip !== "len" && f.len && lenOf(a.minutes) !== f.len) return false;
  if (skip !== "minRating" && f.minRating != null && (a.rating ?? 0) < f.minRating) return false;
  if (skip !== "maxPrice" && f.maxPrice != null && (a.price == null || a.price > f.maxPrice)) return false;
  return true;
}

const minPrice = (xs: ActivityHit[]) => { const ps = xs.map(a => a.price).filter((p): p is number => p != null && p > 0); return ps.length ? Math.min(...ps) : 0; };

export function tourFacets(list: ActivityHit[], f: TourFilter) {
  const byLen = list.filter(a => tourPasses(a, f, "len"));
  const byRating = list.filter(a => tourPasses(a, f, "minRating"));
  const ps = list.map(a => a.price).filter((p): p is number => p != null && p > 0);
  return {
    lens: TOUR_LENS.map(k => { const xs = byLen.filter(a => lenOf(a.minutes) === k); return { key: k, count: xs.length, min: minPrice(xs) }; }).filter(x => x.count),
    ratings: [4, 4.5].map(k => { const xs = byRating.filter(a => (a.rating ?? 0) >= k); return { key: k, count: xs.length, min: minPrice(xs) }; }).filter(x => x.count),
    /** Spanne pro Person für den Regler, auf 5 gerundet */
    price: ps.length ? { lo: Math.floor(Math.min(...ps) / 5) * 5, hi: Math.ceil(Math.max(...ps) / 5) * 5 } : null
  };
}

/** Empfohlen: Reihenfolge des Anbieters; beliebt: Bewertungen mal Bewertung (viele gute Bewertungen zuerst) */
export function sortTours(list: ActivityHit[], by: TourSort): ActivityHit[] {
  const l = [...list];
  if (by === "rating") return l.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0));
  if (by === "price") return l.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (by === "short") return l.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
  if (by === "popular") return l.sort((a, b) => (b.reviews ?? 0) * (b.rating ?? 0) - (a.reviews ?? 0) * (a.rating ?? 0));
  return l;
}
