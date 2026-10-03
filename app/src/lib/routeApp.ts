/* Reiseroute in der App: Flughäfen und Orte aus den geladenen Daten (airports.json, Länderdaten) */
import type { Trip } from "./model";
import { airportOf, ccOf, findCity } from "./geo/places";
import { airportData, geo } from "./geo/geo.svelte";
import { homeOf } from "./ground";
import { itinerary } from "./itinerary";
import { buildRoute, type Route } from "./route";

export function tripRoute(trip: Trip): Route {
  const cc = ccOf(geo, trip.country);
  return buildRoute(trip, itinerary(trip), {
    airport: code => {
      const a = airportData.airports.find(x => x[0] === code);
      if (a) return { lat: a[4], lon: a[5], name: a[2] };
      const b = airportOf(geo, code);
      return b ? { lat: b.lat, lon: b.lon, name: b.name } : null;
    },
    place: name => { const c = findCity(geo, name, cc) || findCity(geo, name); return c ? { lat: c.lat, lon: c.lon } : null; }
  }, homeOf(trip));
}
