/*
 * Übersetzungen: t("schlüssel", { n: 3 }) liefert den Text in der gewählten Sprache.
 * Deutsch ist die Quelle (de.ts), fehlt ein Text in einer Sprache, gilt Englisch, dann Deutsch.
 * Mehrzahl über Intl.PluralRules: Schlüssel mit .one/.few/.many/.other (Russisch, Polnisch, Arabisch brauchen mehr als zwei).
 * Deutsch und Englisch sind immer da (Quelle und Ersatz), die übrigen Sprachen lädt die App erst bei Bedarf.
 */
import { de } from "./de";
import { en } from "./en";

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

/** Wörterbücher: Deutsch und Englisch fest, die übrigen nachgeladen (fehlende Texte: Englisch, dann Deutsch) */
const DICTS: Partial<Record<Lang, Dict>> = { de, en };
const LOADERS: Record<Exclude<Lang, "de" | "en">, () => Promise<Dict>> = {
  es: () => import("./es").then(m => m.es),
  fr: () => import("./fr").then(m => m.fr),
  pl: () => import("./pl").then(m => m.pl),
  ru: () => import("./ru").then(m => m.ru),
  ar: () => import("./ar").then(m => m.ar)
};
/** zählt geladene Sprachen hoch, damit die Oberfläche nach dem Laden neu übersetzt */
const loaded = $state({ n: 0 });

/** Sprache laden (falls nötig); danach sind ihre Texte da */
export async function loadLang(l: Lang): Promise<void> {
  if (DICTS[l]) return;
  DICTS[l] = await LOADERS[l as keyof typeof LOADERS]();
  loaded.n++;
}

/** Sprachen für die Auswahl */
export const available = () => LANGS;

const KEY = "rk-lang";
const known = (c?: string | null): Lang | null => (LANGS.find(l => l.code === c?.slice(0, 2).toLowerCase())?.code ?? null);

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

/** Sprache wechseln: erst laden, dann umschalten (kein kurzes Englisch dazwischen) */
export async function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch {}
  await loadLang(l).catch(() => {});
  i18n.lang = l;
  applyDocument();
}

/** beim Start: gewählte Sprache laden, bevor die App erscheint */
export const i18nReady = () => loadLang(i18n.lang).catch(() => {});

/** <html lang dir> passend zur Sprache (Arabisch von rechts nach links) */
export function applyDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = i18n.lang;
  document.documentElement.dir = "rtl" in langInfo() ? "rtl" : "ltr";
}

const fill = (s: string, p?: Record<string, string | number>) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);

function raw(key: string): string | undefined {
  void loaded.n;
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
