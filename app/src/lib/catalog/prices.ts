/*
 * Preispunkte aus geprüften Übernahmen (#652 Teil 2, Entscheidung Dani 02.11.): Nach der Preisprüfung in der Reise geht
 * je Bereich nur ein Preispunkt an den Such-Dienst: Betrag pro Person, Monat, Gruppengröße, Datum. Keine Anbieter, keine
 * Links, kein Bezug zu Konto oder Reise. Der Such-Dienst speichert die Punkte je Eintrag (catalogStats/{id}, öffentlich
 * lesbar), die Anreise in einer eigenen Tabelle nach Entfernung (catalogStats/_arrival). Der Richtwert im Katalog ist die
 * Mitte der Punkte der letzten Monate, Ausreißer verworfen, bevorzugt aus der passenden Saison. Gemeinsam für App und Worker.
 */
import { PEAK_FACTOR, PEAK_MONTHS, FLIGHT_PP } from "./arrival";
import type { CatalogEntry } from "./types";

/** stay: Unterkunft an einem Ort (pro Person für den Aufenthalt), tour: Tour (pro Person), arrival: Flug hin und zurück pro Person nach Entfernung */
export type PointCat = "stay" | "tour" | "arrival";
/** c Bereich, k Ort, Tourname bzw. Zeile der Flug-Tabelle, pp pro Person (€), m Reisemonat, n Gruppengröße, d Datum */
export interface PricePoint { c: PointCat; k: string; pp: number; m: number; n: number; d: string }

/** Dokument für die Anreise-Tabelle */
export const ARRIVAL_DOC = "_arrival";
/** je Dokument höchstens so viele Punkte, nicht älter als KEEP_MONTHS */
export const MAX_POINTS = 80;
export const KEEP_MONTHS = 12;
/** je Meldung höchstens so viele Punkte (Unterkünfte, Touren, Anreisen einer Reise) */
export const MAX_SEND = 16;
/** Ausreißer: außerhalb des 1,5-fachen Quartilsabstands, erst ab so vielen Punkten */
export const OUTLIER_MIN = 4;
/** Saison bevorzugen, wenn es dort so viele Punkte gibt */
export const SEASON_MIN = 3;

const CATS: PointCat[] = ["stay", "tour", "arrival"];
const ID = /^[A-Za-z0-9_:-]{4,80}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const peakOf = (m: number) => PEAK_MONTHS.includes(m);

/** Meldung prüfen: Eintrag und Punkte, sonst Fehlertext (Worker) */
export function parsePoints(body: unknown, today = new Date().toISOString().slice(0, 10)): { entry: string; points: PricePoint[] } | string {
  const b = body as { entry?: unknown; points?: unknown } | null;
  if (!b || typeof b.entry !== "string" || !ID.test(b.entry) || b.entry === ARRIVAL_DOC) return "Eintrag fehlt";
  if (!Array.isArray(b.points) || !b.points.length || b.points.length > MAX_SEND) return "Preispunkte fehlen";
  const keys = new Set(FLIGHT_PP.map(r => String(r.upTo)));
  const out: PricePoint[] = [];
  for (const x of b.points as Record<string, unknown>[]) {
    const c = x?.c as PointCat, k = typeof x?.k === "string" ? x.k.trim().slice(0, 80) : "";
    const pp = Number(x?.pp), m = Number(x?.m), n = Number(x?.n);
    if (!CATS.includes(c) || !k || !(pp > 0 && pp < 20000) || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(n) || n < 1 || n > 60) return "Preispunkt ungültig";
    // keine Links oder Adressen als Schlüssel, Anreise nur mit einer Zeile der Tabelle
    if (/https?:|www\.|@/i.test(k) || (c === "arrival" && !keys.has(k))) return "Preispunkt ungültig";
    out.push({ c, k, pp: Math.round(pp), m, n, d: today });
  }
  return { entry: b.entry, points: out };
}

/** neue Punkte dazu, ältere als KEEP_MONTHS weg, höchstens MAX_POINTS (die neuesten) */
export function addPoints(old: PricePoint[], add: PricePoint[], today = new Date().toISOString().slice(0, 10)): PricePoint[] {
  const t = new Date(today + "T00:00:00Z");
  t.setUTCMonth(t.getUTCMonth() - KEEP_MONTHS);
  const min = t.toISOString().slice(0, 10);
  return [...old.filter(p => p && DAY.test(p.d) && p.d >= min), ...add].sort((a, b) => a.d.localeCompare(b.d)).slice(-MAX_POINTS);
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
const quart = (s: number[], q: number) => { const pos = (s.length - 1) * q, lo = Math.floor(pos); return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo); };
/** Ausreißer verwerfen: außerhalb des 1,5-fachen Quartilsabstands (ab OUTLIER_MIN Werten) */
export function withoutOutliers(xs: number[]): number[] {
  if (xs.length < OUTLIER_MIN) return xs;
  const s = [...xs].sort((a, b) => a - b), q1 = quart(s, 0.25), q3 = quart(s, 0.75), r = 1.5 * (q3 - q1);
  return xs.filter(x => x >= q1 - r && x <= q3 + r);
}

/** Richtwert aus den Punkten: Mitte ohne Ausreißer; mit Monat bevorzugt aus derselben Saison (Hauptsaison oder nicht) */
export function guide(pts: PricePoint[], month?: number): { pp: number; n: number; stand: string } | null {
  if (!pts.length) return null;
  const same = month ? pts.filter(p => peakOf(p.m) === peakOf(month)) : [];
  const use = same.length >= SEASON_MIN ? same : pts;
  const vals = withoutOutliers(use.map(p => p.pp));
  return { pp: Math.round(median(vals)), n: use.length, stand: use.map(p => p.d).sort().at(-1)!.slice(0, 7) };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Eintrag mit geprüften Preisen: Unterkunft je Ort und Touren nach Namen bekommen die Mitte der Punkte, Stand und Zahl der
 * Prüfungen. Ohne Punkte bleibt der Wert des Erstellers bzw. der Reiseidee.
 */
export function applyStats(e: CatalogEntry, pts: PricePoint[], month?: number): CatalogEntry {
  if (!pts.length) return e;
  const by = (c: PointCat, k: string) => pts.filter(p => p.c === c && norm(p.k) === norm(k));
  let stand = e.stand, touched = false, most = 0;
  const upd = <T extends { pp?: number }>(x: T, g: ReturnType<typeof guide>): T => {
    if (!g) return x;
    touched = true;
    most = Math.max(most, g.n);
    if (g.stand > stand) stand = g.stand;
    const { range: _r, ...rest } = x as T & { range?: unknown };
    return { ...(rest as T), pp: g.pp };
  };
  const stays = e.costs.filter(c => c.cat === "stay");
  const costs = e.costs.map(c => (c.cat === "stay" ? upd(c, guide(by("stay", c.place || (stays.length === 1 ? e.stops[0]?.place || "" : "")), month)) : c));
  const tours = e.tours.map(x => upd(x, guide(by("tour", x.name), month)));
  if (!touched) return e;
  return { ...e, costs, tours, stand, checked: most };
}

/** Flug-Tabelle aus den Anreise-Punkten (Zeile → Richtwert, Nebensaison); erst ab SEASON_MIN Punkten je Zeile */
export function arrivalTable(pts: PricePoint[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set(pts.filter(p => p.c === "arrival").map(p => p.k))) {
    const vals = withoutOutliers(pts.filter(p => p.c === "arrival" && p.k === k).map(p => p.pp));
    if (vals.length >= SEASON_MIN) out[k] = Math.round(median(vals));
  }
  return out;
}

/** Flugpreis pro Person (hin und zurück) als Anreise-Punkt: Weg zum Flughafen dazu, Hauptsaison herausgerechnet */
export const arrivalPoint = (pp: number, month: number, access: number) => Math.round(pp / (peakOf(month) ? PEAK_FACTOR : 1) + access);
