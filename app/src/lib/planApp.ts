/* Link von den Inhaltsseiten anwenden: neue Reise mit Ziel, Gruppe und den Kosten der Reiseidee, direkt geöffnet (#314, #402) */
import { parsePlan, stripPlan } from "./plan";
import { app, newTrip } from "./store.svelte";
import { groupTravelers, nextAnimal, placeholderTravelers } from "./placeholders";
import { countryName } from "./geo/locations";
import { familiesOf, ideaItems } from "./idea";
import type { Item, Traveler } from "./model";

export async function applyPlanLink(): Promise<boolean> {
  const p = parsePlan(location.search);
  if (!p) return false;
  history.replaceState(null, "", stripPlan(new URL(location.href)));
  let travelers: Traveler[] | undefined;
  if (p.fam) {
    const used: string[] = [];
    travelers = placeholderTravelers(p.fam.map(f => { const animal = nextAnimal(used); used.push(animal); return { animal, adults: f.adults, kids: f.kids }; }));
  } else if (p.group) travelers = groupTravelers(p.group, 0);
  // Reiseidee nur bei Bedarf nachladen (Texte aller Inhaltsseiten)
  let items: Item[] | undefined, kicker: string | undefined;
  if (p.idea) {
    const { PAGES, STAND } = await import("./seo/pages");
    const page = PAGES.find(x => x.slug === p.idea);
    if (page) { items = ideaItems(page, STAND, familiesOf(travelers)); kicker = page.example; }
  }
  newTrip({ place: p.place, ...(p.name ? { name: p.name } : {}), ...(travelers ? { travelers } : {}), ...(items ? { items, kicker } : {}) });
  if (p.cc) app.trip.country = countryName(p.cc);
  app.home = false;
  return true;
}
