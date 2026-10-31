/* Import in die offene Reise öffnen (#615): ganze Reise erweitern oder ein Kapitel, ggf. an einen vorhandenen Posten */
import type { ImportScope } from "./scope";
import type { Shared } from "./share.svelte";

export interface ImportTarget {
  scope: ImportScope;
  /** Angebote kommen als weitere Angebote an diesen Posten (aus dessen Suche heraus) */
  itemId?: string;
  /** aus dem Teilen-Menü am Handy (#616): in die zuletzt geöffnete Reise */
  shared?: Shared;
}

export const importIn = $state<{ open: boolean; target: ImportTarget }>({ open: false, target: { scope: "all" } });

export function openImport(scope: ImportScope, itemId?: string, shared?: Shared) {
  importIn.target = { scope, ...(itemId ? { itemId } : {}), ...(shared ? { shared } : {}) };
  importIn.open = true;
}
