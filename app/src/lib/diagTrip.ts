/*
 * Diagnose (…/?diag, #612): gleich eine Demo-Reise öffnen, denn gemessen werden soll in der Reise. Ohne echte Namen.
 * Gibt es sie schon (Name „Diagnose-Reise“), wird sie wieder geöffnet statt neu angelegt.
 */
import { allTrips, app, openTrip, startTrip } from "./store.svelte";
import type { Item, Traveler } from "./model";

export const DIAG_NAME = "Diagnose-Reise";

export function openDiagTrip() {
  const old = allTrips().find(m => m.name === DIAG_NAME);
  if (old) { openTrip(old.id, "Diagnose"); return; }
  const fam = (h: string, ages: number[]) => ages.map((age, i) => ({ id: `${h}${i}`, name: `${h} ${i + 1}`, household: h, age })) as Traveler[];
  startTrip([...fam("A", [38, 40, 9]), ...fam("B", [36, 37])]);
  const items = [
    { id: "dg-s1", cat: "stay", name: "Ferienhaus", status: "chosen", from: "2027-07-17", to: "2027-07-24", options: [{ id: "dg-s1a", label: "Haus", price: { mode: "unit", basis: "night", currency: "EUR", unit: 200 } }] },
    { id: "dg-a1", cat: "attractions", name: "Bootstour", status: "idea", options: [{ id: "dg-a1a", label: "Tagestour", price: { mode: "person", currency: "EUR", adult: 50, child: 25, infant: 0 } }] }
  ] as unknown as Item[];
  Object.assign(app.trip, { name: DIAG_NAME, place: "Split", country: "Kroatien", from: "2027-07-17", to: "2027-07-24" });
  app.trip.items.push(...items);
}
