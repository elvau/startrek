/*
 * Name einer Station für Anzeige und Unterkunftssuche: Stadt aus dem Flug, sonst die Stadt des Flughafens
 * (Flughafenliste: GIG → Rio de Janeiro), sonst der Ort am Flughafen, sonst der Code.
 */
import { airportOf, cityForAirport, type GeoData } from "../geo/places";
import { locOf, type AirportData } from "../geo/locations";

export function stationName(g: GeoData, aps: AirportData, ap?: string, city?: string): string {
  if (city) return city;
  if (!ap) return "";
  // Stadt mit mehreren Flughäfen (RIO: GIG, SDU) hat den schöneren Namen, sonst die Stadt am Flughafen
  const c = aps.cities.find(x => x[4].includes(ap));
  if (c) return locOf(aps, c[0], "city")?.city || c[2];
  const l = aps.airports.length ? locOf(aps, ap, "airport") : null;
  if (l?.city) return l.city;
  const a = airportOf(g, ap);
  return (a && cityForAirport(g, a)?.name) || ap;
}
