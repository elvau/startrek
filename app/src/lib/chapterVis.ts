/*
 * Welche Kapitel die Reise zeigt (#618). Hat sie ein Paket (nicht aufgebrochen), steht das Kapitel „Gesamtpaket“ an der
 * Stelle von „Abheben“ und „Unterkunft“: Pakete mit allen Teilen, darunter Ergänzungen (Flug für Nachzügler, zwei Nächte
 * woanders). Ohne Paket verschwindet „Abheben“, wenn die Reise nicht fliegt (Camper, Anreise ohne Flug, „Kein Flug
 * nötig“) und nichts darin steht; „Flug hinzufügen“ bringt es zurück. Das Datenmodell bleibt: Posten behalten ihre Kategorie.
 */
import { CHAPTERS, type Chapter, type ChapterKey } from "./chapters";
import type { CatKey, Item, Trip } from "./model";
import { pkgInfo, pkgOf, pkgState } from "./package";

/** Pakete, die gerade gelten (nicht aufgebrochen), in der Reihenfolge der Reise */
export function activePkgs(trip: Trip): string[] {
  const ids: string[] = [];
  for (const it of trip.items) {
    const p = pkgOf(it);
    if (!p || ids.includes(p.id)) continue;
    const info = pkgInfo(trip, p.id);
    if (info && pkgState(info) !== "off") ids.push(p.id);
  }
  return ids;
}

/** Posten in einem geltenden Paket: stehen im Gesamtpaket, nicht in ihren Kapiteln */
export function pkgItems(trip: Trip): Set<string> {
  const ids = new Set(activePkgs(trip));
  return new Set(trip.items.filter(i => { const p = pkgOf(i); return !!p && ids.has(p.id) && i.status !== "dropped"; }).map(i => i.id));
}

const hasContent = (trip: Trip, cat: CatKey) =>
  trip.items.some(i => i.cat === cat && !i.auto) || !!trip.simple?.[cat] || (trip.lines || []).some(l => l.cat === cat && (l.amount > 0 || l.label.trim()));

/** Reise fliegt nicht: Camper, Anreise ohne Flug oder ausdrücklich „Kein Flug nötig“ */
export const noFlight = (trip: Trip) =>
  trip.chapters?.flights === false || !!trip.camper || trip.items.some((i: Item) => i.arrival && i.status !== "dropped");

/** ausgeblendete Kapitel */
export function hiddenChapters(trip: Trip): Set<ChapterKey> {
  const out = new Set<ChapterKey>();
  if (activePkgs(trip).length) { out.add("flights"); out.add("stay"); }
  else {
    out.add("pkg");
    if (trip.chapters?.flights !== true && !hasContent(trip, "flights") && noFlight(trip)) out.add("flights");
  }
  return out;
}

/** sichtbare Kapitel in der Reihenfolge der Reise */
export function visibleChapters(trip: Trip): Chapter[] {
  const hide = hiddenChapters(trip);
  return CHAPTERS.filter(c => !hide.has(c.k));
}

/** Kapitel, in dem ein Posten steht */
export function chapterOf(trip: Trip, it: Item): ChapterKey {
  if (pkgItems(trip).has(it.id)) return "pkg";
  if ((it.cat === "flights" || it.cat === "stay") && activePkgs(trip).length) return "pkg";
  return it.cat;
}
