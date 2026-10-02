/*
 * Aktionsseite (Zuschüsse Stufe 2): öffentliche Seite einer Reise zum Mitfinanzieren, z. B. für Oma und Opa, Sponsoren
 * oder die Vereinskasse. Ziel, Fortschritt (aus den Zuschüssen der Reise), Überweisung per GiroCode (EPC-QR) oder
 * PayPal.me. Das Geld fließt nie über Split&Fly, sondern direkt an den Organisator (kein Zahlungsdienst, ZAG).
 * Öffentlich in Firestore (campaigns/{id}): nur Titel, Text, Ort, Daten, Beträge, Kontoinhaber, IBAN, PayPal-Name;
 * keine Namen der Mitreisenden. Lesen ohne Konto über die REST-Schnittstelle (die Seite lädt kein Firebase).
 */
import { emulator } from "./cloud/config";
import type { Key } from "./i18n/types";

export interface Campaign {
  /** zufällige Kennung der öffentlichen Seite */
  id: string;
  /** Konto, das veröffentlicht hat (nur dieses darf die Seite ändern) */
  owner?: string;
  title: string;
  text?: string;
  /** Ziel in Euro; fehlt: Reisekosten */
  goal?: number;
  holder: string;
  iban: string;
  /** PayPal.me-Name (ohne Adresse) */
  paypal?: string;
  /** zuletzt veröffentlicht (ISO) */
  at?: string;
}

/** was öffentlich steht */
export interface CampaignDoc {
  owner: string;
  trip: string;
  title: string;
  text: string;
  place: string;
  from: string;
  to: string;
  goal: number;
  raised: number;
  pledged: number;
  holder: string;
  iban: string;
  paypal: string;
}

export const LIMITS = { title: 100, text: 600, holder: 70, place: 100, paypal: 40 };

/** IBAN ohne Leerzeichen, groß */
export const cleanIban = (s: string) => s.replace(/\s+/g, "").toUpperCase();
/** in Vierergruppen: „DE89 3704 0044 0532 0130 00“ */
export const formatIban = (s: string) => cleanIban(s).replace(/(.{4})/g, "$1 ").trim();

/** Prüfsumme nach ISO 13616 (mod 97) */
export function validIban(s: string): boolean {
  const v = cleanIban(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const d of r) m = (m * 10 + +d) % 97;
  return m === 1;
}

/** PayPal.me-Name aus Eingabe oder Link („paypal.me/Anna“ → „Anna“) */
export function cleanPaypal(s = ""): string {
  const v = s.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?paypal\.me\//i, "").replace(/\/.*$/, "");
  return /^[A-Za-z0-9._-]{1,40}$/.test(v) ? v : "";
}
export const paypalUrl = (name: string) => `https://paypal.me/${encodeURIComponent(name)}`;

/**
 * GiroCode (EPC069-12, Version 002, UTF-8): Banking-Apps übernehmen Empfänger, IBAN und Verwendungszweck.
 * Ohne Betrag, den wählt, wer überweist.
 */
export function epcPayload(c: { holder: string; iban: string; purpose: string; amount?: number }): string {
  const amount = c.amount && c.amount > 0 ? `EUR${c.amount.toFixed(2)}` : "";
  return ["BCD", "002", "1", "SCT", "", c.holder.trim().slice(0, 70), cleanIban(c.iban), amount, "", "", c.purpose.trim().slice(0, 140)].join("\n");
}

/** Text in UTF-8-Bytes als „binäre“ Zeichenkette (für den QR-Code im Byte-Modus) */
export const utf8Binary = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));

/** öffentlicher Link */
export const campaignLink = (id: string, origin: string, base = "/") => `${origin}${base}?aktion=${encodeURIComponent(id)}`;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** öffentlicher Inhalt aus der Reise und den Summen (Zuschüsse eingegangen bzw. zugesagt) */
export function campaignDoc(c: Campaign, trip: { id: string; place?: string; from?: string; to?: string }, sums: { total: number; raised: number; pledged: number }, owner: string): CampaignDoc {
  return {
    owner, trip: trip.id,
    title: c.title.trim().slice(0, LIMITS.title), text: (c.text || "").trim().slice(0, LIMITS.text),
    place: (trip.place || "").slice(0, LIMITS.place), from: trip.from || "", to: trip.to || "",
    goal: Math.round(Math.max(0, c.goal ?? sums.total)), raised: r2(Math.max(0, sums.raised)), pledged: r2(Math.max(0, sums.pledged)),
    holder: c.holder.trim().slice(0, LIMITS.holder), iban: cleanIban(c.iban), paypal: cleanPaypal(c.paypal)
  };
}

/** Fehler vor dem Veröffentlichen (Schlüssel der Übersetzung) oder null */
export function campaignProblem(c: Campaign, consent: boolean): Key | null {
  if (!c.title.trim()) return "cmp.errTitle";
  if (!c.holder.trim()) return "cmp.errHolder";
  if (!validIban(c.iban)) return "cmp.errIban";
  if (c.paypal?.trim() && !cleanPaypal(c.paypal)) return "cmp.errPaypal";
  if (!consent) return "cmp.errConsent";
  return null;
}

/* ---------- öffentlich lesen (REST, ohne Konto) ---------- */

export function campaignRestUrl(id: string): string {
  const base = emulator ? "http://127.0.0.1:8080/v1" : "https://firestore.googleapis.com/v1";
  const pid = emulator ? "demo-reisekasse" : import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return `${base}/projects/${pid}/databases/(default)/documents/campaigns/${encodeURIComponent(id)}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Firestore-REST-Felder in ein einfaches Objekt */
export function fromRest(j: any): (CampaignDoc & { updated?: string }) | null {
  const f = j?.fields;
  if (!f) return null;
  const str = (k: string) => (typeof f[k]?.stringValue === "string" ? f[k].stringValue : "");
  const num = (k: string) => Number(f[k]?.doubleValue ?? f[k]?.integerValue ?? 0) || 0;
  return {
    owner: str("owner"), trip: str("trip"), title: str("title"), text: str("text"), place: str("place"), from: str("from"), to: str("to"),
    goal: num("goal"), raised: num("raised"), pledged: num("pledged"), holder: str("holder"), iban: str("iban"), paypal: str("paypal"),
    ...(f.updatedAt?.timestampValue ? { updated: f.updatedAt.timestampValue } : {})
  };
}

export async function fetchCampaign(id: string, f: typeof fetch = fetch): Promise<(CampaignDoc & { updated?: string }) | null> {
  if (!/^[A-Za-z0-9]{12,40}$/.test(id)) return null;
  const r = await f(campaignRestUrl(id), { cache: "no-store" });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`campaign ${r.status}`);
  return fromRest(await r.json());
}
