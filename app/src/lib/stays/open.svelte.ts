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
  // aus einem Posten heraus bleibt er offen (die Suche liegt als Fenster darüber), sonst schließen
  if (!scope.itemId) app.editing = null;
  staySearch.scope = scope;
  staySearch.open = true;
}
