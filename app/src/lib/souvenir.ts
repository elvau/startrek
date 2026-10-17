/*
 * Souvenirs (#421): automatischer Posten unter Sonstiges, gehört zu den versteckten Kosten (#417).
 * Betrag pro Person und Reise: eigener der Reise, sonst aus den Vorlieben (Gruppe vor eigenen), sonst Standard.
 */
import { t } from "./i18n/index.svelte";
import { uid, type Item, type Prefs, type Trip } from "./model";

export const SOUVENIR_DEFAULT = 30;

/** Betrag pro Person und woher er kommt */
export function souvenirRate(trip: Trip, prefs: Prefs): { eur: number; from: "trip" | "prefs" | "default" } {
  if (trip.souvenir?.eur != null) return { eur: trip.souvenir.eur, from: "trip" };
  if (prefs.souvenirs != null) return { eur: prefs.souvenirs, from: "prefs" };
  return { eur: SOUVENIR_DEFAULT, from: "default" };
}

/** Posten nachführen; true, wenn sich etwas geändert hat */
export function syncSouvenir(trip: Trip, prefs: Prefs): boolean {
  const have = trip.items.find(i => i.auto === "souvenir");
  const eur = souvenirRate(trip, prefs).eur;
  if (!trip.souvenir?.on || !(eur > 0)) {
    if (!have) return false;
    trip.items = trip.items.filter(i => i.auto !== "souvenir");
    return true;
  }
  const name = t("souv.item");
  const price = { mode: "person" as const, currency: "EUR", adult: eur, child: eur, infant: 0 };
  if (!have) {
    const it: Item = { id: uid(), cat: "misc", auto: "souvenir", name, status: "idea", options: [{ id: uid(), label: "", price }] };
    trip.items.push(it);
    return true;
  }
  const o = have.options[0];
  if (have.name === name && o && JSON.stringify(o.price) === JSON.stringify(price)) return false;
  have.name = name;
  if (o) o.price = price; else have.options = [{ id: uid(), label: "", price }];
  return true;
}
