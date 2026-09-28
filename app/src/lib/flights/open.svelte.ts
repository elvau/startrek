/* Flugsuche von überall öffnen: Kapitel-Knopf oder Flug-Posten */
import { app } from "../store.svelte";

export interface FlightScope {
  /** nur diese Personen fliegen (fehlt: Vorschlag) */
  ids?: string[];
  /** Treffer kommen als Angebote in diesen Posten */
  itemId?: string;
}

export const flightSearch = $state<{ open: boolean; scope: FlightScope }>({ open: false, scope: {} });

export function openFlightSearch(scope: FlightScope = {}) {
  app.editing = null;
  flightSearch.scope = scope;
  flightSearch.open = true;
}
