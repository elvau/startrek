/* Orts- und Flughafendaten in der App: einmal laden, reaktiv für Plan und Suche */
import { emptyGeo, loadGeo, airportOf, ccOf } from "./places";
import type { Trip } from "../model";
import { emptyAirports, loadAirports } from "./locations";

export const geo = $state(emptyGeo());

/** Weltdaten laden, dann die Orte der Länder dieser Reise (Zielland, Flughäfen der Flüge) */
export async function ensureGeo(trip: Trip) {
  await loadGeo(geo, []);
  const aps = trip.items.filter(i => i.cat === "flights").flatMap(i => i.options.flatMap(o => (o.legs || []).flatMap(l => [l.from, l.to])));
  const ccs = [ccOf(geo, trip.country), ...aps.map(a => (a ? airportOf(geo, a)?.cc : null))].filter((x): x is string => !!x && x !== "DE");
  await loadGeo(geo, [...new Set(ccs)]);
}

/** Flughäfen und Städte für die Auswahl (airports.json), erst beim ersten Öffnen einer Suche */
export const airportData = $state(emptyAirports());
export const ensureAirports = () => loadAirports(airportData);
