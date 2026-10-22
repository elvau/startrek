/*
 * Trinkgeld (#517): Vorliebe der Person, die die Reise ansieht (das Land kommt aus der Reise selbst).
 * Nur im Speicher, nicht in der Reise: Öffnen einer Reise schreibt so nichts (sonst Wettlauf mit Änderungen anderer).
 */
export const tipCtx = $state<{ off?: boolean }>({});
