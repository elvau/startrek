/*
 * Pauschalreise als Posten (#188): kein eigener Posten-Typ. Flug, Unterkunft und ggf. Transfer bleiben normale Posten
 * in ihren Kapiteln, ihre Angebote tragen dieselbe Paket-Kennung. Der Paketpreis steht am Angebot der Unterkunft
 * (main), die anderen Teile kosten 0 € („im Paket“). So rechnen Anwesenheit, Karte, Nebenkosten und Aufteilung wie
 * bei einzelnen Posten. Der Status gilt für alle Teile gemeinsam. Paket aufbrechen und Vergleich: #460.
 */
import { t, type Key } from "./i18n/index.svelte";
import { uid, type CatKey, type Item, type Option, type Status, type Trip } from "./model";

export type PkgPart = "flights" | "stay" | "transport";
export interface PkgInfo { id: string; main: Item; parts: Item[] }

/** Paket-Kennung des gewählten bzw. einzigen Angebots eines Postens */
export function pkgOf(it: Item): { id: string; main: boolean } | null {
  const o = (it.chosen && it.options.find(x => x.id === it.chosen)) || (it.options.length === 1 ? it.options[0] : it.options.find(x => x.pkg));
  return o?.pkg ? { id: o.pkg.id, main: !!o.pkg.main } : null;
}

/** alle Posten eines Pakets; null, wenn es keine Unterkunft mit dem Paketpreis gibt */
export function pkgInfo(trip: Trip, id: string): PkgInfo | null {
  const items = trip.items.filter(i => i.status !== "dropped" && pkgOf(i)?.id === id);
  const main = items.find(i => pkgOf(i)!.main);
  return main ? { id, main, parts: items.filter(i => i !== main) } : null;
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
