/*
 * Reise im Katalog veröffentlichen (#644): Eintrag aus der Reise (fromTrip.ts), Angaben des Erstellers (Titel,
 * Kurzbeschreibung, Reiseart, gute Monate), Plausibilitätscheck (check.ts), gelbe Hinweise im Eintrag. Der Eintrag ist eine
 * eigene Kopie in Firestore (catalog/{id}); Änderungen an der Reise gehen nur über „Eintrag aktualisieren“ hinein.
 * Lesen ohne Konto über die REST-Schnittstelle (wie Aktionsseiten), damit der Katalog kein Firebase laden muss.
 */
import { emulator } from "../cloud/config";
import { scrub, privateWords } from "./fromTrip";
import { checkTrip, publicWarn, type Finding } from "./check";
import { CATALOG_KINDS, shapeErrors, type CatalogEntry, type CatalogKind } from "./types";
import type { Trip } from "../model";

/** Längen wie in app/firestore.rules (Titel und Kurzbeschreibung stecken dort in data) */
export const PUB_LIMITS = { title: 80, summary: 280, data: 100000 };
/** Fassung der Bedingungen für veröffentlichte Reisen (public/agb.html, Abschnitt „Reisekatalog“) */
export const CATALOG_TERMS = "2026-11-02";

export interface PublishInput { title: string; summary: string; kind: CatalogKind; months: number[] }

/** was im Dokument catalog/{id} steht */
export interface CatalogDoc { uid: string; by: string; data: string; terms: string }

/** Angaben vorbelegt aus dem Eintrag (der aus der Reise kommt) */
export const inputOf = (e: CatalogEntry): PublishInput => ({ title: e.title, summary: e.summary || "", kind: e.kind, months: [...e.months].sort((a, b) => a - b) });

const months = (ms: number[]) => [...new Set(ms.filter(m => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);

/** Angaben wie eingetippt (für den Check: Kontaktdaten und Namen sollen dort auffallen, nicht still verschwinden) */
export function withInput(e: CatalogEntry, i: PublishInput): CatalogEntry {
  const summary = i.summary.trim();
  return { ...e, title: i.title.trim(), ...(summary ? { summary } : { summary: undefined }), kind: CATALOG_KINDS.includes(i.kind) ? i.kind : e.kind, months: months(i.months) };
}

export interface Draft { entry: CatalogEntry; findings: Finding[]; blocked: boolean }

/**
 * Eintrag, wie er öffentlich wird: Angaben gekürzt und bereinigt (Namen, Anbieter, Buchungsnummern, Kontaktdaten, Links),
 * gelbe Hinweise aus dem Check, Benutzername als Ersteller. id: bei „Eintrag aktualisieren“ die bisherige Kennung.
 */
export function draftEntry(trip: Trip, base: CatalogEntry, i: PublishInput, o: { by: string; id?: string }): Draft {
  const typed = withInput(base, i);
  const findings = checkTrip(trip, typed);
  if (!typed.title) findings.unshift({ level: "red", code: "noTitle" });
  const words = privateWords(trip);
  const title = scrub(typed.title, words).slice(0, PUB_LIMITS.title).trim();
  const summary = scrub(typed.summary || "", words).slice(0, PUB_LIMITS.summary).trim();
  const warn = publicWarn(findings);
  const entry: CatalogEntry = {
    ...typed, id: o.id || base.id, source: "user", by: o.by,
    title: title || typed.stops[0]?.place || "–", ...(summary ? { summary } : { summary: undefined }),
    ...(warn.length ? { warn } : { warn: undefined })
  };
  // undefined-Felder nicht mitschicken
  for (const k of Object.keys(entry) as (keyof CatalogEntry)[]) if (entry[k] === undefined) delete entry[k];
  return { entry, findings, blocked: findings.some(f => f.level === "red") };
}

/** Dokument für Firestore (ohne Konto, das setzt cloud.publishEntry); null, wenn der Eintrag zu groß ist */
export function catalogDoc(e: CatalogEntry): Omit<CatalogDoc, "uid"> | null {
  const data = JSON.stringify(e);
  return data.length < PUB_LIMITS.data ? { by: e.by || "", data, terms: CATALOG_TERMS } : null;
}

/** Link der Reise zum veröffentlichten Eintrag (in der Reise gespeichert, nur für den Ersteller bedienbar) */
export type TripPub = NonNullable<Trip["pub"]>;
export const tripPub = (id: string, uid: string, i: PublishInput, now = new Date()): TripPub =>
  ({ id, uid, at: now.toISOString(), input: { title: i.title.trim(), summary: i.summary.trim(), kind: i.kind, months: months(i.months) } });

/* ---------- öffentlich lesen (REST, ohne Konto) ---------- */

export function catalogRestUrl(pageToken?: string): string {
  const base = emulator ? "http://127.0.0.1:8080/v1" : "https://firestore.googleapis.com/v1";
  const pid = emulator ? "demo-reisekasse" : import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return `${base}/projects/${pid}/databases/(default)/documents/catalog?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
}

/** veröffentlichter Eintrag mit dem Konto, das ihn veröffentlicht hat (eigene Einträge erkennen) */
export interface PublicEntry { entry: CatalogEntry; uid: string; updated?: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
/** ein Dokument der REST-Antwort in einen Eintrag; kaputte oder fremd geformte Einträge fallen weg */
export function entryFromRest(d: any): PublicEntry | null {
  const f = d?.fields;
  const id = typeof d?.name === "string" ? d.name.split("/").pop() : "";
  if (!f || !id) return null;
  const str = (k: string) => (typeof f[k]?.stringValue === "string" ? f[k].stringValue : "");
  let e: CatalogEntry;
  try { e = JSON.parse(str("data")); } catch { return null; }
  if (!e || typeof e !== "object" || !Array.isArray(e.stops) || !Array.isArray(e.costs) || !e.group) return null;
  // Kennung, Herkunft und Ersteller aus dem Dokument (von den Regeln geprüft), nicht aus dem Text
  e = { ...e, id, source: "user", by: str("by"), tours: Array.isArray(e.tours) ? e.tours : [], days: Array.isArray(e.days) ? e.days : [], months: Array.isArray(e.months) ? e.months : [] };
  if (shapeErrors(e).length) return null;
  const updated = f.at?.timestampValue;
  return { entry: e, uid: str("uid"), ...(updated ? { updated } : {}) };
}

/** ein Eintrag; null, wenn es ihn nicht (mehr) gibt */
export async function fetchEntry(id: string, f: typeof fetch = fetch): Promise<PublicEntry | null> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return null;
  const r = await f(catalogRestUrl().replace(/\?.*$/, `/${encodeURIComponent(id)}`), { cache: "no-store" });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`catalog ${r.status}`);
  return entryFromRest(await r.json());
}

/** alle veröffentlichten Einträge (höchstens 3 Seiten à 300) */
export async function fetchCatalog(f: typeof fetch = fetch): Promise<PublicEntry[]> {
  const out: PublicEntry[] = [];
  let token: string | undefined;
  for (let i = 0; i < 3; i++) {
    const r = await f(catalogRestUrl(token), { cache: "no-store" });
    if (!r.ok) { if (r.status === 404 || r.status === 403) break; throw new Error(`catalog ${r.status}`); }
    const j = await r.json();
    for (const d of j.documents || []) { const x = entryFromRest(d); if (x) out.push(x); }
    token = j.nextPageToken;
    if (!token) break;
  }
  return out;
}
