/*
 * Automatische Posten einer Reise nachführen, ohne sie zu öffnen (Vorschau, Realitätscheck #461): Verpflegung (braucht
 * Länderdaten), Souvenirs und Transport vor Ort (braucht Länder- und Flughafendaten), wie im KI-Planer.
 */
import type { Trip } from "../model";
import { syncFood } from "../food";
import { syncSouvenir } from "../souvenir";
import { localPlanFor, syncLocal } from "../localcost";
import { airportData, ensureAirports, geo } from "../geo/geo.svelte";
import { loadGeo } from "../geo/places";
import { moneyExact } from "../calc";
import { dir } from "../directory.svelte";
import { prefsFor } from "../prefs";

/** Länder- und Flughafendaten laden (einmal) */
export function loadAutoData() { void loadGeo(geo, []).catch(() => {}); void ensureAirports().catch(() => {}); }
/** bereit, sobald beides da ist (sonst fehlen Verpflegung und Transport vor Ort in der Rechnung) */
export const autoReady = () => geo.world.length > 0 && airportData.airports.length > 0;

export function syncAuto(tr: Trip) {
  if (geo.world.length) syncFood(tr, geo);
  syncSouvenir(tr, prefsFor(tr, dir));
  if (geo.world.length && airportData.airports.length) syncLocal(tr, localPlanFor(tr, geo, airportData), v => moneyExact(v, "EUR"));
}
