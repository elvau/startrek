/* Reise zu einem Event: Dialog von überall öffnen (Start, Kopfbereich) */
import { app } from "../store.svelte";

/** fresh: Reise wurde eben nur für den Planer angelegt (Start → „Zu einem Event“); ohne übernommenen Vorschlag verschwindet sie wieder (#546) */
export const eventPlanner = $state({ open: false, fresh: false });

export function openEventPlanner() {
  app.editing = null;
  eventPlanner.fresh = false;
  eventPlanner.open = true;
}

/** für eine eben angelegte Reise (Start → „Zu einem Event“) */
export function openEventPlannerFresh() {
  openEventPlanner();
  eventPlanner.fresh = true;
}
