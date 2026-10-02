/* Lage auf der Karte: Link zu Google Maps (ohne Schlüssel, öffnet erst beim Antippen) und Punkte für die Karte in der App */
import type { Item, Option, Trip } from "../model";

/** Lage eines Angebots: Koordinaten vom Anbieter und Suchtext für Google Maps (z. B. „Hotel Sol, Palma“) */
export interface Loc { lat?: number; lon?: number; q?: string }

const ok = (n: unknown): n is number => typeof n === "number" && isFinite(n);
export const hasCoords = (l?: { lat?: number; lon?: number }): l is { lat: number; lon: number } =>
  !!l && ok(l.lat) && ok(l.lon) && Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180 && !(l.lat === 0 && l.lon === 0);

/**
 * Google-Maps-Link (Maps URLs, ohne API-Schlüssel). Mit Namen sucht Google den Ort selbst
 * (dann mit Fotos und Bewertungen), sonst die Koordinaten als Stecknadel.
 */
export function mapsUrl(l?: Loc): string | undefined {
  if (!l) return undefined;
  const q = l.q?.trim() || (hasCoords(l) ? `${l.lat.toFixed(6)},${l.lon.toFixed(6)}` : "");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : undefined;
}

/** Suchtext aus Name und Ort, ohne doppelten Ort („Palma, Palma“) */
export function locText(name?: string, place?: string): string {
  const n = (name || "").trim(), p = (place || "").trim();
  if (!n) return p;
  return p && !n.toLowerCase().includes(p.split(",")[0].toLowerCase()) ? `${n}, ${p}` : n;
}

/** Lage eines Postens: gespeichert am Angebot, bei älteren Unterkünften aus Name und Ort der Suche */
export function itemLoc(item: Item, o: Option | null | undefined, trip: Trip): Loc | undefined {
  if (o?.loc && (o.loc.q || hasCoords(o.loc))) return o.loc;
  if (item.cat === "stay" && o?.label) return { q: locText(o.label, o.query?.place || trip.place) };
  return undefined;
}

/** Lage aus einem Suchtreffer (Unterkunft, Event): nur, was vorhanden ist */
export function locOf(name: string | undefined, place: string | undefined, c?: { lat?: number; lon?: number }): Loc | undefined {
  const q = locText(name, place);
  const l: Loc = { ...(hasCoords(c) ? { lat: Math.round(c.lat * 1e6) / 1e6, lon: Math.round(c.lon * 1e6) / 1e6 } : {}), ...(q ? { q } : {}) };
  return l.q || hasCoords(l) ? l : undefined;
}
