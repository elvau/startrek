/* Dialog „Erlebnisse finden“ von überall öffnen (Kapitel Erlebnisse) */
import { app } from "../store.svelte";

export const explore = $state<{ open: boolean; tab: "events" | "tours" }>({ open: false, tab: "tours" });

/** Touren & Tickets zuerst; „Event hinzufügen“ öffnet gleich die Events */
export function openExplore(tab: "events" | "tours" = "tours") {
  app.editing = null;
  explore.tab = tab;
  explore.open = true;
}
