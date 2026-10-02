/*
 * Anzeigewährung: gerechnet wird in Euro, jede Person sieht die Beträge in ihrer eigenen Währung (auf diesem Gerät
 * gewählt, Vorschlag aus der Region des Browsers, z. B. pl-PL → Złoty). Umgerechnet mit den Tageskursen der EZB
 * vom Such-Dienst. Ohne Kurse bleibt es bei Euro.
 */
import type { Rates } from "./fx";

/** Währungen mit EZB-Referenzkurs */
export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "PLN", "CZK", "HUF", "SEK", "NOK", "DKK", "RON", "BGN", "TRY", "ISK", "AUD", "CAD", "NZD",
  "JPY", "CNY", "HKD", "SGD", "KRW", "INR", "IDR", "MYR", "PHP", "THB", "ILS", "MXN", "BRL", "ZAR"] as const;

/** Region des Browsers → Währung (nur Währungen mit EZB-Kurs, sonst Euro) */
const BY_REGION: Record<string, string> = {
  US: "USD", GB: "GBP", CH: "CHF", LI: "CHF", PL: "PLN", CZ: "CZK", HU: "HUF", SE: "SEK", NO: "NOK", DK: "DKK", RO: "RON", BG: "BGN",
  TR: "TRY", IS: "ISK", AU: "AUD", CA: "CAD", NZ: "NZD", JP: "JPY", CN: "CNY", HK: "HKD", SG: "SGD", KR: "KRW", IN: "INR", ID: "IDR",
  MY: "MYR", PH: "PHP", TH: "THB", IL: "ILS", MX: "MXN", BR: "BRL", ZA: "ZAR"
};
export function currencyFor(lang: string | undefined): string {
  const region = (lang || "").split(/[-_]/)[1]?.toUpperCase();
  return (region && BY_REGION[region]) || "EUR";
}

const KEY = "rk-currency", RKEY = "rk-rates";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };

function initial(): string {
  const saved = read(KEY);
  if (saved && (CURRENCIES as readonly string[]).includes(saved)) return saved;
  return currencyFor(typeof navigator !== "undefined" ? navigator.language : undefined);
}
function cachedRates(): Rates | null {
  try { const r = JSON.parse(read(RKEY) || "null") as (Rates & { at?: number }) | null; return r?.rates ? r : null; } catch { return null; }
}

export const fx = $state<{ currency: string; rates: Rates | null }>({ currency: initial(), rates: cachedRates() });

export function setCurrency(c: string) {
  fx.currency = c;
  write(KEY, c);
  if (c !== "EUR") void loadRates();
}

const URL_ = (import.meta.env.VITE_FLIGHTS_URL as string | undefined)?.replace(/\/$/, "") || "";
let loading: Promise<void> | null = null;
/** Kurse höchstens einmal am Tag neu holen */
export function loadRates(): Promise<void> {
  const r = fx.rates as (Rates & { at?: number }) | null;
  if (r?.at && Date.now() - r.at < 12 * 3600 * 1000) return Promise.resolve();
  if (!URL_) return Promise.resolve();
  loading ||= fetch(`${URL_}/rates`).then(res => (res.ok ? res.json() : null)).then((d: Rates | null) => {
    if (d?.rates?.USD) { fx.rates = d; write(RKEY, JSON.stringify({ ...d, at: Date.now() })); }
  }).catch(() => {}).finally(() => { loading = null; });
  return loading;
}

/** Betrag in Euro in der Anzeigewährung; ohne Kurs bleibt es Euro */
export function shown(vEur: number): { v: number; currency: string } {
  const c = fx.currency, r = c === "EUR" ? 1 : fx.rates?.rates[c];
  return r ? { v: vEur * r, currency: c } : { v: vEur, currency: "EUR" };
}

/** Eingaben in der Anzeigewährung: Wert zum Anzeigen (auf Cent gerundet) und zurück in Euro zum Speichern */
export const toShown = (vEur: number) => Math.round(shown(vEur).v * 100) / 100;
export const fromShown = (v: number) => { const s = shown(1); return s.currency === "EUR" ? v : v / s.v; };

/** Zeichen der Anzeigewährung („€“, „zł“, „£“) für Eingabefelder */
export function symbol(locale: string): string {
  const c = shown(1).currency;
  try { return new Intl.NumberFormat(locale, { style: "currency", currency: c }).formatToParts(0).find(p => p.type === "currency")?.value || c; }
  catch { return c; }
}

/** Währung für neue Preise: die eigene, sofern ein Kurs da ist (sonst würden Złoty als Euro zählen) */
export const entryCurrency = () => shown(1).currency;
