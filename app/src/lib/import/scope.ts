/*
 * Import je Einstieg (#615): Aus einem Kapitel heraus übernimmt der Import nur, was dorthin gehört (Flug, Unterkunft,
 * Tour, Transport). Was die KI darüber hinaus findet, kommt als Rückfrage „Habe auch das gefunden“ zum Anhaken; gilt der
 * Preis nur für das ganze Paket, ist es vorab angehakt (sonst stünde ein Teil mit 0 € da).
 */
import type { CatKey, Item, Trip } from "../model";
import type { ImportedOffer } from "./ai";

/** wohin importiert wird: ganze Reise oder ein Kapitel */
export type ImportScope = "all" | Exclude<CatKey, "misc">;
export const IMPORT_SCOPES: readonly ImportScope[] = ["all", "flights", "stay", "attractions", "transport"];
/** Teile eines Angebots, wie sie als Posten in der Reise landen */
export type OfferPart = "flights" | "stay" | "cruise" | "transfer" | "rental" | "offer";

/** welche Teile in welches Kapitel gehören */
export const SCOPE_PARTS: Record<Exclude<ImportScope, "all">, readonly OfferPart[]> = {
  flights: ["flights"],
  stay: ["stay", "cruise"],
  attractions: ["offer"],
  transport: ["transfer", "rental"]
};

const hasTotal = (o: ImportedOffer) => !!(o.price?.total || o.price?.perPerson);

/** Teile des Angebots, die Posten ergeben (wie in importToTrip) */
export function partsOf(o: ImportedOffer): OfferPart[] {
  const ps: OfferPart[] = [];
  if (o.flights?.legs.length) ps.push("flights");
  if (o.cruise) ps.push("cruise");
  if (o.stay) ps.push("stay");
  if (o.transfer?.included || o.transfer?.price) ps.push("transfer");
  if (o.rental || o.kind === "rental") ps.push("rental");
  // sonst nichts Bekanntes (z. B. Event, Tour): ein Posten mit dem Preis laut Angebot
  if (!ps.length && hasTotal(o)) ps.push("offer");
  return ps;
}

/** Preis nur für das ganze Paket (Flug mit Unterkunft bzw. Kreuzfahrt, keine eigenen Teilpreise), wie in importToTrip */
export const packagePriced = (o: ImportedOffer) =>
  !!(o.flights?.legs.length && (o.cruise || o.stay) && !o.flights.price && !o.stay?.price && hasTotal(o) && (o.kind === "package" || o.kind === "other" || o.kind === "cruise"));

/** Teile im Kapitel und darüber hinaus; ganze Reise: alles im Umfang */
export function splitScope(o: ImportedOffer, scope: ImportScope): { inScope: OfferPart[]; more: OfferPart[] } {
  const all = partsOf(o);
  if (scope === "all") return { inScope: all, more: [] };
  const want = SCOPE_PARTS[scope];
  // „Angebot“ ohne bekannte Teile (Event, Tour …) gehört zu den Erlebnissen, sonst zu keinem Kapitel
  return { inScope: all.filter(p => want.includes(p)), more: all.filter(p => !want.includes(p)) };
}

/** vorab angehakt: Paketpreis (gilt nur zusammen) oder im Kapitel nichts gefunden */
export function preselectMore(o: ImportedOffer, scope: ImportScope): OfferPart[] {
  const { inScope, more } = splitScope(o, scope);
  return packagePriced(o) || !inScope.length ? more : [];
}

/** Angebot nur mit diesen Teilen (die übrigen fallen weg, Preis und Nebenkosten bleiben) */
export function pickParts(o: ImportedOffer, parts: readonly OfferPart[]): ImportedOffer {
  const keep = new Set(parts);
  const out: ImportedOffer = { ...o };
  if (!keep.has("flights")) delete out.flights;
  if (!keep.has("stay")) delete out.stay;
  if (!keep.has("cruise")) delete out.cruise;
  if (!keep.has("transfer")) delete out.transfer;
  if (!keep.has("rental")) { delete out.rental; if (out.kind === "rental") out.kind = "other"; }
  return out;
}

/**
 * Angebot an einen vorhandenen Posten (aus dessen Suche heraus): Angebote der neu angelegten Posten gleicher Kategorie
 * kommen als weitere Angebote an den Posten, die neuen Posten fallen weg. Gibt die Posten zurück, die etwas bekommen haben.
 */
export function mergeInto(trip: Trip, items: Item[], itemId?: string): Item[] {
  const target = itemId ? trip.items.find(i => i.id === itemId) : undefined;
  if (!target) return items;
  const same = items.filter(i => i.cat === target.cat && !i.cruise === !target.cruise);
  if (!same.length) return items;
  for (const it of same) target.options.push(...it.options);
  const gone = new Set(same.map(i => i.id));
  trip.items = trip.items.filter(i => !gone.has(i.id));
  if (trip.offer) trip.offer.items = trip.offer.items.map(id => (gone.has(id) ? target.id : id)).filter((id, k, a) => a.indexOf(id) === k);
  return [target, ...items.filter(i => !gone.has(i.id))];
}
