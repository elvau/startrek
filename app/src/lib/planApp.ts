/* Link von den Inhaltsseiten anwenden: neue Reise mit Ziel und Gruppe, direkt geöffnet (#314) */
import { parsePlan, stripPlan } from "./plan";
import { app, newTrip } from "./store.svelte";
import { groupTravelers, nextAnimal, placeholderTravelers } from "./placeholders";
import { countryName } from "./geo/locations";
import type { Traveler } from "./model";

export function applyPlanLink(): boolean {
  const p = parsePlan(location.search);
  if (!p) return false;
  history.replaceState(null, "", stripPlan(new URL(location.href)));
  let travelers: Traveler[] | undefined;
  if (p.fam) {
    const used: string[] = [];
    travelers = placeholderTravelers(p.fam.map(f => { const animal = nextAnimal(used); used.push(animal); return { animal, adults: f.adults, kids: f.kids }; }));
  } else if (p.group) travelers = groupTravelers(p.group, 0);
  newTrip({ place: p.place, ...(p.name ? { name: p.name } : {}), ...(travelers ? { travelers } : {}) });
  if (p.cc) app.trip.country = countryName(p.cc);
  app.home = false;
  return true;
}
