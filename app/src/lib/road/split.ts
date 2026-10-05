/*
 * Lange Etappe teilen (#201): Zwischenstopps an den Bruchstellen der Strecke als Unterkunfts-Posten (Richtwert, je eine Nacht).
 * Die Ankunft an der nächsten Station verschiebt sich um die Zahl der Stopps; geht es nach Hause, endet die Reise später.
 */
import { t } from "../i18n/index.svelte";
import { isActive, uid, type Item, type Trip } from "../model";
import { addDays } from "../calc/travel";
import { stayPlace } from "../itinerary";
import { km, type LL } from "./ors";
import type { Etappe } from "./trip";

/** Richtwert Hotel an der Strecke pro Person und Nacht */
export const STOP_PER_PERSON = 45;

/** Punkt bei Anteil f (0…1) der Strecke entlang des Verlaufs */
export function along(path: LL[], f: number): LL {
  const total = path.slice(1).reduce((s, p, i) => s + km(path[i], p), 0);
  let left = total * f;
  for (let i = 1; i < path.length; i++) {
    const d = km(path[i - 1], path[i]);
    if (left <= d) { const r = d ? left / d : 0; return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * r, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * r]; }
    left -= d;
  }
  return path.at(-1)!;
}

/** Zwischenstopps anlegen (n Etappen = n−1 Stopps); gibt die neuen Posten zurück */
export function splitLeg(trip: Trip, e: Etappe, n: number, near: (p: LL) => { name: string } | null): Item[] {
  if (!e.date || n < 2) return [];
  const persons = trip.travelers.filter(isActive).length || 1;
  const adults = trip.travelers.filter(x => isActive(x) && (x.age == null || Number(x.age) >= (trip.settings?.adultAge ?? 12))).length || 1;
  const out: Item[] = [];
  for (let k = 1; k < n; k++) {
    const place = near(along(e.path, k / n))?.name || `${e.from.name} – ${e.to.name}`;
    const from = addDays(e.date, k - 1), to = addDays(e.date, k);
    out.push({ id: uid(), cat: "stay", name: t("road.stopName", { place }), status: "idea", hint: "road:stop", from, to,
      options: [{ id: uid(), label: t("road.stopEst"), estimate: true, price: { mode: "unit", currency: "EUR", unit: STOP_PER_PERSON * persons },
        query: { place, checkin: from, checkout: to, adults, childAges: [], rooms: 1 } }] });
  }
  const shift = n - 1;
  if (e.to.kind === "station") {
    // Unterkunft an der Station: Ankunft später (mindestens eine Nacht bleibt)
    for (const s of trip.items.filter(i => i.cat === "stay" && i.status !== "dropped" && i.from === e.date && stayPlace(trip, i) === e.to.name)) {
      const nf = addDays(s.from!, shift);
      if (s.to && nf < s.to) s.from = nf;
    }
  } else if (trip.to) trip.to = addDays(trip.to, shift);
  trip.items.push(...out);
  return out;
}
