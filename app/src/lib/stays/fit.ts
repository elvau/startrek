/*
 * Passt die Reise noch zum Reiseziel? (#551) Nach einem Zielwechsel (z. B. Variante „Makarska“ → „Alcúdia“) bleiben Flüge
 * und Unterkünfte zum alten Ziel stehen. Ziel- bzw. Abflughafen oder Unterkunft weiter als MAX_KM vom Reiseziel: Hinweis
 * statt Fahrzeit und Flughafen-Übernachtung. Rundreisen: Unterkünfte nur, wenn keine einzige in der Nähe des Ziels liegt.
 */
import { activeOption } from "../calc";
import { airportOf, ccOf, findCity, kmBetween, type GeoData } from "../geo/places";
import type { Trip } from "../model";

/** weiter weg passt nicht zum Reiseziel (Flughafen bzw. Unterkunft) */
export const MAX_KM = 300;

export interface OffTarget {
  id: string;
  kind: "flight" | "stay";
  /** Flughafen (IATA) bzw. Ort der Unterkunft */
  where: string;
  km: number;
}

/** Mittelpunkt des Reiseziels (Ort im Land der Reise, sonst irgendwo); null: unbekannt, dann keine Prüfung */
export function destOf(trip: Pick<Trip, "place" | "country">, g: GeoData): { name: string; lat: number; lon: number } | null {
  const place = (trip.place || "").trim();
  if (!place) return null;
  const cc = ccOf(g, trip.country);
  return (cc ? findCity(g, place, cc) : null) || findCity(g, place);
}

/** Posten, die nicht zum Reiseziel passen (je Posten einmal, der weiteste Grund) */
export function offTarget(trip: Trip, g: GeoData, maxKm = MAX_KM): OffTarget[] {
  const dest = destOf(trip, g);
  if (!dest) return [];
  const out: OffTarget[] = [];
  for (const it of trip.items) {
    if (it.cat !== "flights" || it.status === "dropped" || it.follow) continue;
    const legs = activeOption(it, trip)?.legs || [];
    // Ziel des Hinflugs und Start des Rückflugs; Zwischenflüge einer Rundreise zählen nicht
    const outTo = legs.filter(l => l.dir === "out").sort((a, b) => a.dep.localeCompare(b.dep)).at(-1)?.to;
    const backFrom = legs.filter(l => l.dir === "back").sort((a, b) => a.dep.localeCompare(b.dep))[0]?.from;
    let worst: OffTarget | null = null;
    for (const code of [outTo, backFrom]) {
      const ap = code ? airportOf(g, code) : null;
      const km = ap ? Math.round(kmBetween(dest, ap)) : 0;
      if (ap && km > maxKm && (!worst || km > worst.km)) worst = { id: it.id, kind: "flight", where: ap.code, km };
    }
    if (worst) out.push(worst);
  }
  const stays = trip.items.filter(it => it.cat === "stay" && it.status !== "dropped" && !it.cruise && !it.auto).map(it => {
    const o = activeOption(it, trip);
    const priv = it.private?.place ? findCity(g, it.private.place, ccOf(g, it.private.country)) || findCity(g, it.private.place) : null;
    const at = o?.loc?.lat != null && o.loc.lon != null ? { lat: o.loc.lat, lon: o.loc.lon } : priv;
    const where = it.private?.place || o?.query?.place || it.name;
    return at ? { id: it.id, where, km: Math.round(kmBetween(dest, at)) } : null;
  }).filter((x): x is { id: string; where: string; km: number } => !!x);
  if (stays.length && stays.every(s => s.km > maxKm)) out.push(...stays.map(s => ({ ...s, kind: "stay" as const })));
  return out;
}

/** Flughafen weit weg vom Reiseziel? Dann keine Fahrzeit und keine Nacht am Flughafen vorschlagen */
export const farFromDest = (dest: { lat: number; lon: number } | null, ap: { lat: number; lon: number }, maxKm = MAX_KM) =>
  !!dest && kmBetween(dest, ap) > maxKm;
