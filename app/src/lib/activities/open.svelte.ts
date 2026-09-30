/* Dialog „Erlebnisse finden“ von überall öffnen (Kapitel Erlebnisse) */
import { app } from "../store.svelte";

export const explore = $state<{ open: boolean; tab: "events" | "tours" }>({ open: false, tab: "events" });

export function openExplore(tab: "events" | "tours" = "events") {
  app.editing = null;
  explore.tab = tab;
  explore.open = true;
}
