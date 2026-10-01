/*
 * Übersetzungen: t("schlüssel", { n: 3 }) liefert den Text in der gewählten Sprache.
 * Deutsch ist die Quelle (de.ts), fehlt ein Text in einer Sprache, gilt Englisch, dann Deutsch.
 * Mehrzahl über Intl.PluralRules: Schlüssel mit .one/.few/.many/.other (Russisch, Polnisch, Arabisch brauchen mehr als zwei).
 */
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { pl } from "./pl";
import { ru } from "./ru";
import { ar } from "./ar";

import type { Dict, Key } from "./types";
export type { Dict, Key };

export const LANGS = [
  { code: "de", name: "Deutsch", locale: "de-DE" },
  { code: "en", name: "English", locale: "en-GB" },
  { code: "es", name: "Español", locale: "es-ES" },
  { code: "fr", name: "Français", locale: "fr-FR" },
  { code: "pl", name: "Polski", locale: "pl-PL" },
  { code: "ru", name: "Русский", locale: "ru-RU" },
  { code: "ar", name: "العربية", locale: "ar", rtl: true }
] as const;
export type Lang = (typeof LANGS)[number]["code"];

/** Wörterbücher; weitere Sprachen kommen hier dazu (fehlende Texte: Englisch, dann Deutsch) */
const DICTS: Partial<Record<Lang, Dict>> = { de, en, es, fr, pl, ru, ar };
/** Sprachen mit (zumindest teilweiser) Übersetzung, für die Auswahl */
export const available = () => LANGS.filter(l => DICTS[l.code]);

const KEY = "rk-lang";
const known = (c?: string | null): Lang | null => (LANGS.find(l => l.code === c?.slice(0, 2).toLowerCase() && DICTS[l.code])?.code ?? null);

/** gemerkt, sonst Browsersprache, sonst Deutsch (Tests ohne Browser: Deutsch) */
function detect(): Lang {
  if (typeof window === "undefined") return "de";
  try { const s = known(localStorage.getItem(KEY)); if (s) return s; } catch {}
  for (const l of navigator.languages || [navigator.language]) { const k = known(l); if (k) return k; }
  return "de";
}

export const i18n = $state<{ lang: Lang }>({ lang: detect() });

export const langInfo = () => LANGS.find(l => l.code === i18n.lang)!;
/** Gebietsschema für Intl (Datum, Zahlen) */
export const locale = () => langInfo().locale;

export function setLang(l: Lang) {
  i18n.lang = l;
  try { localStorage.setItem(KEY, l); } catch {}
  applyDocument();
}

/** <html lang dir> passend zur Sprache (Arabisch von rechts nach links) */
export function applyDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = i18n.lang;
  document.documentElement.dir = "rtl" in langInfo() ? "rtl" : "ltr";
}

const fill = (s: string, p?: Record<string, string | number>) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);

function raw(key: string): string | undefined {
  const k = key as Key;
  return DICTS[i18n.lang]?.[k] ?? en[k] ?? de[k];
}

/** Text zum Schlüssel, {platzhalter} werden ersetzt */
export function t(key: Key, p?: Record<string, string | number>): string {
  return fill(raw(key) ?? key, p);
}

const rules = new Map<string, Intl.PluralRules>();
/** Mehrzahl: tn("nights", 3) → "3 Nächte"; Schlüssel nights.one / nights.other (… .few, .many, .zero, .two) */
export function tn(key: string, n: number, p?: Record<string, string | number>): string {
  const loc = locale();
  if (!rules.has(loc)) rules.set(loc, new Intl.PluralRules(loc));
  const cat = rules.get(loc)!.select(n);
  const s = raw(`${key}.${cat}`) ?? raw(`${key}.other`) ?? key;
  return fill(s, { n: new Intl.NumberFormat(loc).format(n), ...p });
}

/** Pfeil in Leserichtung (Zeiten „10:00 → 12:00“, „weiter →“); zwischen lateinischen Codes bleibt → */
export const arrow = () => ("rtl" in langInfo() ? "←" : "→");
