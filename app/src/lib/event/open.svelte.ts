/* Reise zu einem Event: Dialog von überall öffnen (Start, Kopfbereich) */
import { app } from "../store.svelte";

export const eventPlanner = $state({ open: false });

export function openEventPlanner() {
  app.editing = null;
  eventPlanner.open = true;
}
