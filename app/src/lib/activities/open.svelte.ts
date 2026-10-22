/* Dialog „Erlebnisse finden“ von überall öffnen (Kapitel Erlebnisse) */
import { app } from "../store.svelte";

/** at: gleich diesen Ort und Tag wählen (Landgang einer Kreuzfahrt, #518) */
export const explore = $state<{ open: boolean; tab: "events" | "tours"; at?: { place: string; date: string } }>({ open: false, tab: "tours" });

/** Touren & Tickets zuerst; „Event hinzufügen“ öffnet gleich die Events */
export function openExplore(tab: "events" | "tours" = "tours", at?: { place: string; date: string }) {
  app.editing = null;
  explore.tab = tab;
  explore.at = at;
  explore.open = true;
}
