/* Unterkunftssuche von überall öffnen: Kapitel-Knopf, Lücke im Plan, Nacht am Flughafen, Posten */
import { app } from "../store.svelte";

export interface StayScope {
  from?: string;
  to?: string;
  /** nur diese Personen (fehlt: alle, die dabei sind) */
  ids?: string[];
  /** Treffer kommen als Angebote in diesen Posten */
  itemId?: string;
  /** Ort vorbelegen, z. B. ein Ort am Flughafen */
  place?: string;
}

export const staySearch = $state<{ open: boolean; scope: StayScope }>({ open: false, scope: {} });

export function openStaySearch(scope: StayScope = {}) {
  // ein offener Posten würde alle anderen Karten (auch den Plan) ausgrauen, bis man woanders hinklickt
  app.editing = null;
  staySearch.scope = scope;
  staySearch.open = true;
}
