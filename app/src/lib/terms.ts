/*
 * AGB (Nutzungsbedingungen, public/agb.html): Zustimmung beim Anmelden, gespeichert im Konto (Directory.terms) mit
 * Fassung und Datum. Neue Fassung (TERMS_VERSION hochzählen): bestehende Konten stimmen beim nächsten Öffnen erneut zu.
 * Zwischen dem Haken im Anmeldefenster und dem fertigen Konto (Anmelde-Link, Weiterleitung) merkt sich die Sitzung die
 * Zustimmung.
 */
import type { Directory } from "./model";

export const TERMS_VERSION = "2026-10-13";
const PENDING = "rk-terms-pending";

export const termsAccepted = (d: Pick<Directory, "terms">) => d.terms?.v === TERMS_VERSION;

/** Zustimmung aus dem Anmeldefenster wartet noch aufs Konto (dann kein Fenster zum Zustimmen) */
export function hasPending(): boolean { try { return sessionStorage.getItem(PENDING) === TERMS_VERSION; } catch { return false; } }

/** Zustimmung im Anmeldefenster (vor dem Konto) */
export function markPending() { try { sessionStorage.setItem(PENDING, TERMS_VERSION); } catch { /* gesperrt */ } }

/** Zustimmung aus dem Anmeldefenster ins Konto übernehmen; true, wenn es eine gab */
export function takePending(d: Directory, now = new Date()): boolean {
  let v: string | null = null;
  try { v = sessionStorage.getItem(PENDING); sessionStorage.removeItem(PENDING); } catch { /* gesperrt */ }
  if (v !== TERMS_VERSION) return false;
  accept(d, now);
  return true;
}

export function accept(d: Directory, now = new Date()) { d.terms = { v: TERMS_VERSION, at: now.toISOString().slice(0, 10) }; }

/** neuere Zustimmung gewinnt (Fassung, dann Datum) */
export function newerTerms(a?: Directory["terms"], b?: Directory["terms"]): Directory["terms"] {
  if (!a || !b) return a || b;
  return b.v > a.v || (b.v === a.v && b.at > a.at) ? b : a;
}

/**
 * Stand aus dem Zwischenspeicher des Browsers, der die aktuelle Zustimmung nicht enthält: noch nicht als Stand des Kontos
 * nehmen, sondern auf den Server warten (sonst blitzt das Zustimmungsfenster kurz auf, obwohl das Konto zugestimmt hat).
 */
export function waitForServer(data: string | null, fromCache: boolean): boolean {
  if (!fromCache) return false;
  if (!data) return true;
  try { return !termsAccepted(JSON.parse(data)); } catch { return true; }
}
