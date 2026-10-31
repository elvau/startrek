/* Import in die offene Reise öffnen (#615): ganze Reise erweitern oder ein Kapitel, ggf. an einen vorhandenen Posten */
import type { ImportScope } from "./scope";

export interface ImportTarget {
  scope: ImportScope;
  /** Angebote kommen als weitere Angebote an diesen Posten (aus dessen Suche heraus) */
  itemId?: string;
}

export const importIn = $state<{ open: boolean; target: ImportTarget }>({ open: false, target: { scope: "all" } });

export function openImport(scope: ImportScope, itemId?: string) {
  importIn.target = { scope, ...(itemId ? { itemId } : {}) };
  importIn.open = true;
}
