/*
 * Trinkgeld (#517): Land der Reise (für die Sitte) und Vorliebe der Person, die die Reise ansieht.
 * Nur im Speicher, nicht in der Reise: Öffnen einer Reise schreibt so nichts (sonst Wettlauf mit Änderungen anderer).
 */
export const tipCtx = $state<{ cc?: string; off?: boolean }>({});
