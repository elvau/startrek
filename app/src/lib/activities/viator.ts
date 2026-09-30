/*
 * Viator Partner-API (v2, Freitext-Suche): buchbare Touren und Tickets mit Preis ab, Bewertung und Bild.
 * Der Schlüssel ist ein Partner-Schlüssel; die Produkt-Links enthalten die Partnerkennung (Provision bei Buchung).
 */
import type { ActivityHit, ActivityQuery } from "./types";

export const VIATOR_URL = "https://api.viator.com/partner";

/** Sprachen, die Viator liefert; sonst Englisch */
const LANGS: Record<string, string> = { de: "de-DE", en: "en-US", es: "es-ES", fr: "fr-FR" };

export function viatorBody(q: ActivityQuery) {
  return {
    searchTerm: q.place,
    searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 30 } }],
    currency: "EUR",
    ...(q.from ? { productFiltering: { dateRange: { from: q.from, to: q.to || q.from } } } : {})
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** größtes Bild bis etwa 720 px Breite */
function image(p: any): string | undefined {
  const vs: any[] = (p.images || []).find((i: any) => i.isCover)?.variants || p.images?.[0]?.variants || [];
  const fit = vs.filter(v => v?.url && Number(v.width) <= 720).sort((a, b) => b.width - a.width)[0] || vs.find(v => v?.url);
  return fit?.url;
}

function minutes(d: any): number | undefined {
  const m = Number(d?.fixedDurationInMinutes ?? d?.variableDurationFromMinutes ?? d?.unstructuredDuration);
  return isFinite(m) && m > 0 ? m : undefined;
}

export function fromViator(data: any): ActivityHit[] {
  const list: any[] = data?.products?.results || [];
  return list.map(p => {
    const price = Number(p.pricing?.summary?.fromPrice);
    const rating = Number(p.reviews?.combinedAverageRating), reviews = Number(p.reviews?.totalReviews);
    return {
      id: `viator:${p.productCode}`, source: "viator", sourceName: "Viator", title: String(p.title || ""),
      ...(p.description ? { description: String(p.description).slice(0, 300) } : {}),
      ...(image(p) ? { image: image(p) } : {}),
      ...(isFinite(rating) && rating > 0 ? { rating: Math.round(rating * 10) / 10 } : {}),
      ...(isFinite(reviews) && reviews > 0 ? { reviews } : {}),
      ...(minutes(p.duration) ? { minutes: minutes(p.duration) } : {}),
      ...(isFinite(price) && price > 0 ? { price: Math.round(price * 100) / 100 } : {}),
      currency: String(p.pricing?.currency || "EUR"),
      ...(p.productUrl ? { url: String(p.productUrl) } : {})
    } as ActivityHit;
  }).filter(a => a.title && a.id !== "viator:undefined");
}

export async function searchViator(q: ActivityQuery, key: string, f: typeof fetch = fetch): Promise<ActivityHit[]> {
  const res = await f(`${VIATOR_URL}/search/freetext`, {
    method: "POST",
    headers: { "exp-api-key": key, accept: "application/json;version=2.0", "accept-language": LANGS[q.lang || ""] || "en-US", "content-type": "application/json" },
    body: JSON.stringify(viatorBody(q))
  });
  if (!res.ok) throw new Error(`Viator ${res.status}`);
  return fromViator(await res.json());
}
