/*
 * Pauschalreise als Posten (#188): kein eigener Posten-Typ. Flug, Unterkunft und ggf. Transfer bleiben normale Posten
 * in ihren Kapiteln, ihre Angebote tragen dieselbe Paket-Kennung. Der Paketpreis steht am Angebot der Unterkunft
 * (main), die anderen Teile kosten 0 € („im Paket“). So rechnen Anwesenheit, Karte, Nebenkosten und Aufteilung wie
 * bei einzelnen Posten. Der Status gilt für alle Teile gemeinsam. Paket aufbrechen und Vergleich: #460.
 */
import { t, type Key } from "./i18n/index.svelte";
import { noPrice, uid, type CatKey, type Item, type Option, type Status, type Trip } from "./model";
import { calcOption } from "./calc";

export type PkgPart = "flights" | "stay" | "transport";
export interface PkgInfo { id: string; main: Item; parts: Item[] }

/** Paket-Angebot eines Postens (auch aufgebrochen); active: es zählt gerade (nicht aufgebrochen, nichts anderes gewählt) */
export function pkgOf(it: Item): { id: string; main: boolean; off: boolean; active: boolean } | null {
  const o = it.options.find(x => x.pkg);
  if (!o?.pkg) return null;
  const active = !o.pkg.off && (!it.chosen || it.chosen === o.id);
  return { id: o.pkg.id, main: !!o.pkg.main, off: !!o.pkg.off, active };
}

/** alle Posten eines Pakets; null, wenn es keine Unterkunft mit dem Paketpreis gibt */
export function pkgInfo(trip: Trip, id: string): PkgInfo | null {
  const items = trip.items.filter(i => i.status !== "dropped" && pkgOf(i)?.id === id);
  const main = items.find(i => pkgOf(i)!.main);
  return main ? { id, main, parts: items.filter(i => i !== main) } : null;
}

const pkgOption = (it: Item) => it.options.find(o => o.pkg);
/** günstigstes eigene Angebot (nicht das Paket) eines Teils */
function alternative(it: Item, trip: Trip): { o: Option; net: number } | null {
  const alts = it.options.filter(o => !o.pkg && !noPrice(o)).map(o => ({ o, net: calcOption(o, it, trip).net }));
  return alts.length ? alts.reduce((a, b) => (b.net < a.net ? b : a)) : null;
}

/** Zustand des Pakets: ganz, teilweise ersetzt (ein Teil hat ein anderes Angebot gewählt) oder aufgebrochen */
export function pkgState(info: PkgInfo): "whole" | "mixed" | "off" {
  const all = [info.main, ...info.parts].map(pkgOf);
  if (all.every(p => p?.off)) return "off";
  return all.every(p => p?.active) ? "whole" : "mixed";
}

/**
 * Vergleich (#460): Paket gegen einzeln gebucht aus den eigenen Angeboten der Teile (Suche oder selbst eingetragen).
 * Nur, wenn Flug und Unterkunft einzeln ein Angebot haben; ein Transfer ohne eigenes Angebot fehlt dann (missing).
 */
export function pkgCompare(trip: Trip, info: PkgInfo): { pkg: number; single: number; missing: CatKey[] } | null {
  const items = [info.main, ...info.parts];
  let pkg = 0, single = 0;
  const missing: CatKey[] = [];
  for (const it of items) {
    const po = pkgOption(it);
    if (po) pkg += calcOption(po, it, trip).net;
    const alt = alternative(it, trip);
    if (alt) single += alt.net;
    else if (it.cat === "transport") missing.push(it.cat);
    else return null;
  }
  return { pkg, single, missing };
}

/**
 * Paket aufbrechen: alle Teile rechnen einzeln (günstigstes eigenes Angebot), ohne eigenes Angebot „Preis fehlt“
 * (leeres Angebot zum Eintragen). Das Paket bleibt als verworfenes Angebot.
 */
export function breakPkg(trip: Trip, id: string) {
  for (const it of trip.items.filter(i => pkgOf(i)?.id === id)) {
    const po = pkgOption(it)!;
    po.pkg = { ...po.pkg!, off: true };
    const alt = alternative(it, trip);
    if (alt) { it.chosen = alt.o.id; continue; }
    const empty: Option = { id: uid(), label: "", price: { mode: po.price.mode, currency: po.price.currency, ...(po.price.basis ? { basis: po.price.basis } : {}) } };
    it.options.push(empty);
    it.chosen = empty.id;
  }
}

/** Paket wiederherstellen: wieder der Paketpreis, leere Angebote vom Aufbrechen fallen weg */
export function restorePkg(trip: Trip, id: string) {
  for (const it of trip.items.filter(i => pkgOf(i)?.id === id)) {
    const po = pkgOption(it)!;
    po.pkg = { id: po.pkg!.id, ...(po.pkg!.main ? { main: true } : {}) };
    it.options = it.options.filter(o => o.pkg || o.label || !noPrice(o));
    delete it.chosen;
  }
}

/** Status ändern: gilt für alle Teile desselben Pakets */
export function setStatus(trip: Trip, it: Item, s: Status) {
  it.status = s;
  const p = pkgOf(it);
  if (!p) return;
  for (const x of trip.items) if (x !== it && x.status !== "dropped" && pkgOf(x)?.id === p.id) x.status = s;
}

export interface NewPackage {
  provider?: string;
  /** Preis für alle */
  price?: number;
  currency?: string;
  url?: string;
  parts: PkgPart[];
  stayName?: string;
}

const NAME: Record<PkgPart, Key> = { flights: "pkg.flight", stay: "pkg.stay", transport: "pkg.transfer" };
const CAT: Record<PkgPart, CatKey> = { flights: "flights", stay: "stay", transport: "transport" };

/** Paket von Hand anlegen: je enthaltenem Teil ein Posten, der Preis an der Unterkunft (ohne Unterkunft am ersten Teil) */
export function createPackage(trip: Trip, p: NewPackage): Item[] {
  const id = uid();
  const parts = (["stay", "flights", "transport"] as const).filter(k => p.parts.includes(k));
  if (!parts.length) return [];
  const people = Math.max(1, trip.travelers.filter(x => x.active !== false).length);
  const source = p.provider || p.url ? { name: p.provider || t("pkg.title"), at: new Date().toISOString().slice(0, 10), ...(p.url ? { url: p.url } : {}) } : undefined;
  trip.detail ||= {};
  const items = parts.map((k, i): Item => {
    const main = i === 0;
    const o: Option = {
      id: uid(), label: k === "stay" && p.stayName ? p.stayName : p.provider || t("pkg.title"),
      price: { mode: "unit", currency: p.currency || "EUR", unit: main ? p.price ?? 0 : 0, ...(k === "stay" ? { basis: "stay" as const, capacity: people } : {}) },
      pkg: { id, ...(main ? { main: true } : {}) },
      ...(source ? { source } : {})
    };
    trip.detail![CAT[k]] = true;
    return {
      id: uid(), cat: CAT[k], name: k === "stay" && p.stayName ? p.stayName : t(NAME[k]), status: "idea", options: [o],
      ...(k === "stay" && trip.from && trip.to ? { from: trip.from, to: trip.to } : {}), ...(k === "transport" ? { hint: "transfer" } : {})
    };
  });
  trip.items.push(...items);
  return items;
}

/** Teile eines Pakets in Kurzform für die Hauptkarte („inkl. ✈ Flug · 🚌 Transfer“) */
export const PART_ICON: Record<CatKey, string> = { flights: "✈", stay: "🛏", transport: "🚌", attractions: "🎟", misc: "🧾" };
