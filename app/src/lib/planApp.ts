/* Link von den Inhaltsseiten anwenden: neue Reise mit Ziel, Gruppe und den Kosten der Reiseidee, direkt geöffnet (#314, #402) */
import { parsePlan, stripPlan } from "./plan";
import { app, newTrip } from "./store.svelte";
import { i18n } from "./i18n/index.svelte";
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
    const { PAGES, STAND, STAND_EN, pageIn } = await import("./seo/pages");
    const de = PAGES.find(x => x.slug === p.idea);
    // Posten auf Deutsch nur in deutscher Oberfläche, sonst aus der englischen Fassung
    const en = i18n.lang !== "de", page = de && (en ? pageIn(de, "en") : de);
    if (page) { items = ideaItems(page, en ? STAND_EN : STAND, familiesOf(travelers)); kicker = page.example; }
  }
  newTrip({ place: p.place, ...(p.name ? { name: p.name } : {}), ...(travelers ? { travelers } : {}), ...(items ? { items, kicker } : {}) });
  if (p.cc) app.trip.country = countryName(p.cc);
  app.home = false;
  return true;
}
