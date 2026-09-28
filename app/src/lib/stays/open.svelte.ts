/* Unterkunftssuche von überall öffnen: Kapitel-Knopf, Lücke im Plan, Posten */

export interface StayScope {
  from?: string;
  to?: string;
  /** nur diese Personen (fehlt: alle, die dabei sind) */
  ids?: string[];
  /** Treffer kommen als Angebote in diesen Posten */
  itemId?: string;
}

export const staySearch = $state<{ open: boolean; scope: StayScope }>({ open: false, scope: {} });

export function openStaySearch(scope: StayScope = {}) {
  staySearch.scope = scope;
  staySearch.open = true;
}
