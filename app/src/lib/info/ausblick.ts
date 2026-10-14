/*
 * „Neues & Ausblick“: was neu ist, was bald kommt, bekannte Fehler und häufige Fragen.
 * Die Daten schreibt die Routine „SAF 8 – Ausblick“ täglich aus den Issues mit Label „öffentlich“ (übersetzt und
 * verständlich formuliert) in ausblick.json auf dem Branch „ausblick“; der Such-Dienst liefert sie aus (/ausblick).
 * parseAusblick lässt nur bekannte Felder mit begrenzter Länge durch (die Datei kommt ungeprüft auf die Seite).
 * Ohne Importe, damit der Worker die Datei direkt nutzen kann.
 */

export const AUSBLICK_LANGS = ["de", "en", "es", "fr", "pl", "ru", "ar"] as const;
export type Lang = (typeof AUSBLICK_LANGS)[number];
/** Text je Sprache; fehlt eine Sprache, gilt Englisch, dann Deutsch */
export type L = Partial<Record<Lang, string>>;

export type Status = "geplant" | "in-arbeit" | "auf-test";
export interface Entry { nr?: number; status: Status; titel: L; text?: L }
export interface Release { version: string; datum: string; punkte: L[] }
export interface Faq { f: L; a: L }
export interface Ausblick { stand: string; neu: Release[]; bald: Entry[]; fehler: Entry[]; faq: Faq[] }

/** Rohdatei auf GitHub (Branch „ausblick“) */
export const AUSBLICK_RAW = "https://raw.githubusercontent.com/elvau/startrek/ausblick/ausblick.json";

const STATUS: Status[] = ["geplant", "in-arbeit", "auf-test"];
const MAX = { titel: 120, text: 600, faqA: 900, list: 40, neu: 5, punkte: 12 };

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
const arr = (v: unknown, n: number): unknown[] => (Array.isArray(v) ? v.slice(0, n) : []);
// Steuerzeichen raus, Leerraum zusammenfassen, kürzen
const clean = (s: string, n: number) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

function lang(v: unknown, n: number): L | null {
  const o = obj(v);
  if (!o) return null;
  const out: L = {};
  for (const k of AUSBLICK_LANGS) if (typeof o[k] === "string" && clean(o[k] as string, n)) out[k] = clean(o[k] as string, n);
  return out.de || out.en ? out : null;
}

function entry(v: unknown): Entry | null {
  const o = obj(v);
  const titel = o && lang(o.titel, MAX.titel);
  if (!o || !titel) return null;
  const e: Entry = { status: STATUS.includes(o.status as Status) ? (o.status as Status) : "geplant", titel };
  if (Number.isInteger(o.nr) && (o.nr as number) > 0) e.nr = o.nr as number;
  const text = lang(o.text, MAX.text);
  if (text) e.text = text;
  return e;
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
const keep = <T>(xs: (T | null)[]) => xs.filter((x): x is T => !!x);

/** Datei prüfen und bereinigen; null, wenn sie nicht passt */
export function parseAusblick(v: unknown): Ausblick | null {
  const o = obj(v);
  if (!o || !isDate(o.stand)) return null;
  const neu = keep(arr(o.neu, MAX.neu).map(r => {
    const x = obj(r);
    if (!x || typeof x.version !== "string" || !/^\d+\.\d+\.\d+$/.test(x.version) || !isDate(x.datum)) return null;
    const punkte = keep(arr(x.punkte, MAX.punkte).map(p => lang(p, MAX.text)));
    return punkte.length ? { version: x.version, datum: x.datum.slice(0, 10), punkte } : null;
  }));
  const faq = keep(arr(o.faq, MAX.list).map(q => {
    const x = obj(q);
    const f = x && lang(x.f, MAX.titel * 2), a = x && lang(x.a, MAX.faqA);
    return f && a ? { f, a } : null;
  }));
  return {
    stand: (o.stand as string).slice(0, 20),
    neu,
    bald: keep(arr(o.bald, MAX.list).map(entry)),
    fehler: keep(arr(o.fehler, MAX.list).map(entry)),
    faq
  };
}

/** Text in der gewählten Sprache (sonst Englisch, sonst Deutsch) */
export const pick = (l: L, lng: string): string => l[lng as Lang] || l.en || l.de || "";
