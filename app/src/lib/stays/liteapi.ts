/*
 * liteAPI (Nuitée): Hotelpreise aus vielen Quellen, selbst angemeldet, Schlüssel als Cloudflare-Secret LITEAPI_KEY
 * (Test-Schlüssel sofort, echte Preise mit hinterlegter Karte; Provision je Buchung).
 * Zwei Schritte wie im offiziellen SDK: Hotels am Ort (Name, Lage, Sterne, Foto), dann Preise für diese Hotels.
 * Nur Hotels (keine Ferienwohnungen); Pool, Küche usw. kennt die Schnittstelle hier nicht, dann bleibt sie still.
 */
import type { Board } from "../model";
import type { StayOffer, StayQuery } from "./types";

export const LITEAPI_URL = "https://api.liteapi.travel/v3.0";

/** Gäste auf die Zimmer verteilen: Erwachsene gleichmäßig, Kinder der Reihe nach */
export function occupancies(q: Pick<StayQuery, "adults" | "childAges" | "rooms">): { adults: number; children: number[] }[] {
  const rooms = Math.max(1, Math.min(q.rooms, q.adults));
  const out = Array.from({ length: rooms }, (_, i) => ({ adults: Math.floor(q.adults / rooms) + (i < q.adults % rooms ? 1 : 0), children: [] as number[] }));
  q.childAges.forEach((a, i) => out[i % rooms].children.push(a));
  return out;
}

/** Ausstattung, die liteAPI hier nicht prüfen kann: dann keine Treffer statt falscher */
const UNKNOWN_MUSTS = ["pool", "kitchen", "aircon", "parking"];
export const liteFits = (q: StayQuery) => q.type !== "whole" && !(q.must || []).some(m => UNKNOWN_MUSTS.includes(m));

/** Verpflegung aus Kürzel oder Name („RO“, „BB“, „Breakfast Included“, „Half Board“ …) */
export function boardOfLite(type?: string, name?: string): Board | undefined {
  const s = `${type || ""} ${name || ""}`.toLowerCase();
  if (/\bai\b|all inclusive/.test(s)) return "all";
  if (/\bfb\b|full board/.test(s)) return "full";
  if (/\bhb\b|half board/.test(s)) return "half";
  if (/\bbb\b|breakfast/.test(s)) return "breakfast";
  if (/\bro\b|room only|bed only/.test(s)) return "self";
  return undefined;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() && isFinite(+v) ? +v : undefined);
const amount = (x: any): number | undefined => num(Array.isArray(x) ? x[0]?.amount : x?.amount);

/** günstigstes Angebot eines Hotels: je Zimmerart der Gesamtpreis (alle Zimmer), sonst die Summe der billigsten Rate je Zimmer */
function cheapest(h: any, wantBreakfast: boolean, wantFree: boolean): { total: number; currency: string; board?: Board; free: boolean } | null {
  let best: { total: number; currency: string; board?: Board; free: boolean } | null = null;
  for (const rt of h.roomTypes || []) {
    const rates: any[] = (rt.rates || []).filter((r: any) => {
      const b = boardOfLite(r.boardType, r.boardName);
      return (!wantBreakfast || (b && b !== "self")) && (!wantFree || r.cancellationPolicies?.refundableTag === "RFN");
    });
    if (!rates.length) continue;
    const byRoom = new Map<number, any>();
    for (const r of rates) {
      const k = r.occupancyNumber ?? 1, p = amount(r.retailRate?.total) ?? Infinity, cur = byRoom.get(k);
      if (!cur || p < (amount(cur.retailRate?.total) ?? Infinity)) byRoom.set(k, r);
    }
    const sum = [...byRoom.values()].reduce((v, r) => v + (amount(r.retailRate?.total) ?? NaN), 0);
    const total = !wantBreakfast && !wantFree ? amount(rt.offerRetailRate) ?? sum : sum;
    if (!(total > 0)) continue;
    const r0 = [...byRoom.values()][0];
    const currency = (Array.isArray(r0.retailRate?.total) ? r0.retailRate.total[0]?.currency : rt.offerRetailRate?.currency) || "EUR";
    const c = { total, currency, board: boardOfLite(r0.boardType, r0.boardName), free: [...byRoom.values()].every(r => r.cancellationPolicies?.refundableTag === "RFN") };
    if (!best || c.total < best.total) best = c;
  }
  return best;
}

/** Hotels am Ort und Preise zusammenführen; link: eigene Buchungsseite (White Label), falls eingerichtet */
export function fromLite(hotels: any[], rates: any[], q: StayQuery, link?: string): StayOffer[] {
  const meta = new Map(hotels.map(h => [h.id, h]));
  const must = q.must || [];
  return rates.map((r: any): StayOffer | null => {
    const h = meta.get(r.hotelId);
    const c = cheapest(r, must.includes("breakfast"), must.includes("freeCancel"));
    if (!h || !c) return null;
    const facts = c.free ? ["Kostenlos stornierbar"] : [];
    const url = link ? `${link.replace(/\/$/, "")}/hotels/${encodeURIComponent(r.hotelId)}?checkin=${q.checkin}&checkout=${q.checkout}&adults=${q.adults}${q.childAges.length ? `&children=${q.childAges.join(",")}` : ""}` : undefined;
    return {
      id: "liteapi:" + r.hotelId, source: "liteapi", sourceName: "liteAPI", name: h.name || "?", total: Math.round(c.total), currency: c.currency,
      ...(url ? { url } : {}),
      ...(num(h.rating) != null ? { score: num(h.rating) } : {}), ...(num(h.reviewCount) ? { reviews: num(h.reviewCount) } : {}),
      ...(num(h.stars) ? { stars: Math.round(num(h.stars)!) } : {}),
      ...(h.address || h.city ? { place: [h.address, h.city].filter(Boolean).join(", ") } : {}),
      ...(num(h.latitude) != null && num(h.longitude) != null ? { lat: num(h.latitude), lon: num(h.longitude) } : {}),
      ...(typeof h.main_photo === "string" && /^https:\/\//.test(h.main_photo) ? { image: h.main_photo } : {}),
      ...(facts.length ? { facts } : {}), ...(c.board ? { board: c.board } : {})
    };
  }).filter((o): o is StayOffer => !!o);
}

async function call(f: typeof fetch, key: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await f(`${LITEAPI_URL}${path}`, { ...init, headers: { accept: "application/json", "content-type": "application/json", "x-api-key": key } });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`liteAPI ${res.status}${data?.error?.message ? `: ${data.error.message}` : ""}`);
  return data;
}

/** cc: Land als ISO-Code (ES); ohne kann liteAPI den Ort nicht eindeutig finden */
export async function searchLite(q: StayQuery, key: string, f: typeof fetch = fetch, link?: string): Promise<StayOffer[]> {
  if (!liteFits(q)) return [];
  if (!q.cc) throw new Error("liteAPI braucht das Land des Orts");
  const priced = async (hotels: any[]): Promise<StayOffer[]> => {
    const ids = hotels.filter(h => !q.minStars || (num(h.stars) ?? 0) >= q.minStars).map(h => h.id).filter(Boolean).slice(0, 60);
    if (!ids.length) return [];
    const rates = await call(f, key, "/hotels/rates", {
      method: "POST",
      body: JSON.stringify({ hotelIds: ids, checkin: q.checkin, checkout: q.checkout, currency: q.currency || "EUR", guestNationality: "DE", occupancies: occupancies(q), timeout: 12 })
    });
    return fromLite(hotels.filter(h => ids.includes(h.id)), rates.data || [], q, link);
  };
  const p = new URLSearchParams({ countryCode: q.cc, cityName: q.place, limit: "60" });
  const byName = await priced((await call(f, key, `/data/hotels?${p}`)).data || []);
  if (byName.length || q.lat == null || q.lon == null) return byName;
  // Name passt nicht oder nur zu Hotels ohne Preise (z. B. „Palma“ statt „Palma de Mallorca“): Umkreis von 10 km um den Ort
  // (liteAPI nennt den Umkreis je nach Stand radius oder distance, in Metern)
  const g = new URLSearchParams({ countryCode: q.cc, latitude: String(q.lat), longitude: String(q.lon), radius: "10000", distance: "10000", limit: "60" });
  return priced((await call(f, key, `/data/hotels?${g}`)).data || []);
}
