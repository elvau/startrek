/*
 * Aktionsseite (Zuschüsse Stufe 2): öffentliche Seite einer Reise zum Mitfinanzieren, z. B. für Oma und Opa, Sponsoren
 * oder die Vereinskasse. Ziel, Fortschritt (aus den Zuschüssen der Reise), Zahlen per PayPal.me oder über den Link zu
 * einer Sammelaktion (GoFundMe, Leetchi …). Das Geld fließt nie über Split&Fly, sondern direkt an den Organisator (kein
 * Zahlungsdienst, ZAG). Kontoinhaber und IBAN bieten wir vorerst nicht an (zu heikel auf einer offenen Seite).
 * Öffentlich in Firestore (campaigns/{id}): nur Titel, Text, Ort, Daten, Beträge, PayPal-Name, Link; keine Namen. Lesen ohne Konto über die REST-Schnittstelle (die Seite lädt kein Firebase).
 */
import { emulator } from "./cloud/config";
import type { Key } from "./i18n/types";
import type { Campaign } from "./model";

export type { Campaign };

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
  paypal: string;
  link: string;
}

export const LIMITS = { title: 100, text: 600, place: 100, paypal: 40 };

/** PayPal.me-Name aus Eingabe oder Link („paypal.me/Anna“ → „Anna“) */
export function cleanPaypal(s = ""): string {
  const v = s.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?paypal\.me\//i, "").replace(/\/.*$/, "");
  return /^[A-Za-z0-9._-]{1,40}$/.test(v) ? v : "";
}
export const paypalUrl = (name: string) => `https://paypal.me/${encodeURIComponent(name)}`;

/**
 * Link zu einer Sammelaktion bei einem bekannten Anbieter (nur diese, damit die Seite nicht auf beliebige Adressen
 * verweist). Gleiche Liste in firestore.rules.
 */
export const LINK_HOSTS = ["gofundme.com", "gofund.me", "leetchi.com", "betterplace.me", "ko-fi.com", "revolut.me"];
export function cleanLink(s = ""): string {
  let v = s.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!LINK_HOSTS.includes(host) || u.username || u.password || u.port) return "";
    const out = `https://${host}${u.pathname}${u.search}`;
    return out.length <= 200 && u.pathname.length > 1 ? out : "";
  } catch { return ""; }
}
/** Anzeigename des Anbieters („GoFundMe“) */
export function linkSite(link: string): string {
  const h = link.replace(/^https:\/\//, "").split("/")[0];
  return ({ "gofundme.com": "GoFundMe", "gofund.me": "GoFundMe", "leetchi.com": "Leetchi", "betterplace.me": "betterplace.me", "ko-fi.com": "Ko-fi", "revolut.me": "Revolut" } as Record<string, string>)[h] || h;
}

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
    paypal: cleanPaypal(c.paypal), link: cleanLink(c.link)
  };
}

/** Fehler vor dem Veröffentlichen (Schlüssel der Übersetzung) oder null */
export function campaignProblem(c: Campaign, consent: boolean): Key | null {
  if (!c.title.trim()) return "cmp.errTitle";
  if (c.paypal?.trim() && !cleanPaypal(c.paypal)) return "cmp.errPaypal";
  if (c.link?.trim() && !cleanLink(c.link)) return "cmp.errLink";
  if (!cleanPaypal(c.paypal) && !cleanLink(c.link)) return "cmp.errMethod";
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
    goal: num("goal"), raised: num("raised"), pledged: num("pledged"), paypal: str("paypal"), link: cleanLink(str("link")),
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
