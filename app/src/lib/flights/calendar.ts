/*
 * Preiskalender vor der Suche: Richtpreise pro Person für einen ganzen Monat aus dem Zwischenspeicher von Aviasales
 * (Travelpayouts, prices_for_dates). Kostet keine echte Suche; die Preise sind Suchen der letzten Tage, also „ca.“.
 * Tippt man zwei Tage an, läuft die echte Suche für genau diese Daten.
 */
import { TP_URL } from "./travelpayouts";

export interface CalendarQuery {
  /** Abflug: Flughafen- oder Stadt-Codes (höchstens 4) */
  from: string[];
  /** Ziel: Flughafen- oder Stadt-Codes (höchstens 2) */
  to: string[];
  /** JJJJ-MM */
  month: string;
  oneWay: boolean;
  /** nur Direktflüge */
  direct?: boolean;
}

/** günstigster Richtpreis pro Person je Hinflug-Tag (und Rückflug-Tag) */
export interface CalendarDay { out: string; back?: string; price: number; stops: number }
export interface CalendarResult { days: CalendarDay[]; configured: boolean; error?: string }

const code = (s: unknown) => (typeof s === "string" && /^[A-Za-z]{3}$/.test(s.trim()) ? s.trim().toUpperCase() : null);

export function parseCalendarQuery(b: unknown): CalendarQuery | string {
  const x = (b || {}) as Record<string, unknown>;
  const list = (v: unknown, n: number) => (Array.isArray(v) ? [...new Set(v.map(code).filter((c): c is string => !!c))].slice(0, n) : []);
  const from = list(x.from, 4), to = list(x.to, 2);
  if (!from.length || !to.length) return "Abflug und Ziel als Flughafen- oder Stadt-Codes angeben";
  if (typeof x.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month)) return "Monat als JJJJ-MM angeben";
  return { from, to, month: x.month, oneWay: x.oneWay === true, ...(x.direct === true ? { direct: true } : {}) };
}

export const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };

/** Anfragen: je Abflug und Ziel; hin und zurück mit Rückflug im selben und im nächsten Monat */
export function calendarJobs(q: CalendarQuery): URLSearchParams[] {
  const out: URLSearchParams[] = [];
  for (const from of q.from) for (const to of q.to) for (const ret of q.oneWay ? [undefined] : [q.month, nextMonth(q.month)]) {
    const p = new URLSearchParams({ origin: from, destination: to, departure_at: q.month, sorting: "price", unique: "false", currency: "eur", limit: "1000", page: "1" });
    if (ret) p.set("return_at", ret); else p.set("one_way", "true");
    if (q.direct) p.set("direct", "true");
    out.push(p);
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Antworten zusammenführen: je Tag (bzw. Tagespaar) der günstigste Preis und die wenigsten Umstiege */
export function fromCalendar(datas: any[], q: CalendarQuery): CalendarDay[] {
  const m = new Map<string, CalendarDay>();
  for (const d of datas) for (const x of d?.data || []) {
    if (typeof x.price !== "number" || typeof x.departure_at !== "string") continue;
    const out = x.departure_at.slice(0, 10);
    if (out.slice(0, 7) !== q.month) continue;
    const back = !q.oneWay && typeof x.return_at === "string" ? x.return_at.slice(0, 10) : undefined;
    if (!q.oneWay && (!back || back <= out)) continue;
    const stops = Math.max(x.transfers ?? 0, back ? x.return_transfers ?? 0 : 0);
    const k = out + (back || ""), cur = m.get(k);
    if (!cur) m.set(k, { out, ...(back ? { back } : {}), price: Math.round(x.price), stops });
    else { cur.price = Math.min(cur.price, Math.round(x.price)); cur.stops = Math.min(cur.stops, stops); }
  }
  return [...m.values()].sort((a, b) => a.out.localeCompare(b.out) || (a.back || "").localeCompare(b.back || ""));
}

export async function searchCalendar(q: CalendarQuery, token: string, f: typeof fetch = fetch): Promise<CalendarDay[]> {
  const res = await Promise.allSettled(calendarJobs(q).map(async p => {
    // Token im Kopf statt in der Adresse, damit er in keinem Protokoll landet
    const r = await f(`${TP_URL}?${p}`, { headers: { accept: "application/json", "x-access-token": token } });
    if (!r.ok) throw new Error(`Travelpayouts ${r.status}`);
    return r.json();
  }));
  const ok = res.filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled");
  if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
  return fromCalendar(ok.map(r => r.value), q);
}

/** Tage für den Kalender: Hinflug-Tage, oder Rückflug-Tage zum gewählten Hinflug-Tag (Format wie DayCell) */
export function calendarCells(days: CalendarDay[], which: "out" | "back", outDay?: string | null) {
  const m = new Map<string, { day: string; min: number; stops: number; count: number }>();
  for (const d of days) {
    if (which === "back" && (d.out !== outDay || !d.back)) continue;
    const day = which === "out" ? d.out : d.back!, c = m.get(day);
    if (!c) m.set(day, { day, min: d.price, stops: d.stops, count: 1 });
    else { c.count++; c.min = Math.min(c.min, d.price); c.stops = Math.min(c.stops, d.stops); }
  }
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}
