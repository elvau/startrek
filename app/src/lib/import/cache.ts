/*
 * Angebotsspeicher (#462, nur intern): ausgelesene Angebote bis zum Ablauf wiederverwenden. Gespeichert werden nur
 * neutrale Angebotsdaten, nie Dateien, Screenshots oder Namen; Teilnehmerlisten (mit Namen) gar nicht.
 * - Eingabe-Schlüssel: gleicher Link (ohne Werbe-Parameter), gleiche Datei oder gleicher Text → Treffer ohne KI.
 * - Angebots-Schlüssel: aus den Angebotsdaten (Anbieter, Ziel, Daten, Unterkunft, Preis, Flüge); verschiedene
 *   Eingaben desselben Angebots landen im selben Eintrag.
 * - Gültig bis Ablauf des Angebots, ohne Angabe bis zum Reisedatum, höchstens 14 Tage.
 */
import type { ImportedOffer, ImportRequest } from "./ai";

export const CACHE_MAX_DAYS = 14;

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Link ohne Werbe- und Sitzungsparameter, ohne Anker, Host klein */
export function normUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|session|sid$)/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    // Schrägstrich am Ende des Pfads ist egal
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/\/$/, "");
  } catch { return raw.trim(); }
}

/** Schlüssel der Eingabe (Link, Dateien, Text); gleiche Eingabe → gleicher Schlüssel */
export async function inputKey(r: ImportRequest): Promise<string> {
  const parts = [r.url ? `u:${normUrl(r.url)}` : "", ...r.files.map(f => `f:${f.mime}:${f.data}`), r.text ? `t:${r.text.replace(/\s+/g, " ").trim().toLowerCase()}` : ""].filter(Boolean);
  return sha256(parts.join("\n"));
}

/** Schlüssel des Angebots aus seinen Daten */
export async function offerKey(o: ImportedOffer): Promise<string> {
  const n = (s?: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const legs = (o.flights?.legs || []).map(l => `${n(l.from)}-${n(l.to)}@${(l.dep || "").slice(0, 10)}`).join(",");
  return sha256([o.kind, n(o.provider), n(o.place), o.from || "", o.to || "", n(o.stay?.name), o.price?.total ?? "", o.price?.perPerson ?? "", o.price?.currency || "", legs].join("|"));
}

/** speicherbar? Nur ohne Namen (Teilnehmerlisten bleiben draußen) */
export const cacheable = (o: ImportedOffer) => !o.travelers?.length;

/** Ablauf (ISO-Datum): gültig bis, sonst Reisedatum, höchstens 14 Tage ab heute; null, wenn schon abgelaufen */
export function expiryOf(o: ImportedOffer, today = new Date().toISOString().slice(0, 10)): string | null {
  const max = new Date(Date.parse(today + "T00:00:00Z") + CACHE_MAX_DAYS * 86400000).toISOString().slice(0, 10);
  const end = o.validUntil || o.from || max;
  const out = end < max ? end : max;
  return out < today ? null : out;
}
